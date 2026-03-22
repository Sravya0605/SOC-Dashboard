# ---------- PACKAGE LOADER ----------
pkgs <- c("mongolite","dplyr","lubridate","isotree","digest",
          "jsonlite","RcppRedis","config","logger","R6")

invisible(lapply(pkgs, function(p){
  if (!requireNamespace(p, quietly = TRUE))
    install.packages(p, dependencies = TRUE)
  library(p, character.only = TRUE)
}))

# ---------- HELPERS ----------
`%||%` <- function(a,b) if(!is.null(a) && length(a)>0) a else b

# ---------- CONFIG ----------
conf <- list(
  mongo_uri      = Sys.getenv("MONGO_URI","mongodb://127.0.0.1:27017"),
  redis_host     = Sys.getenv("REDIS_HOST","127.0.0.1"),
  redis_port     = as.numeric(Sys.getenv("REDIS_PORT",6379)),
  # sliding window for training (minutes); smaller = responds to drift faster
  window_mins    = as.numeric(Sys.getenv("WINDOW_MINS",5)),
  # how often to retrain (minutes)
  retrain_mins   = as.numeric(Sys.getenv("RETRAIN_MINS",1)),
  # minimum rows needed before training kicks in
  train_min_rows = as.numeric(Sys.getenv("TRAIN_MIN_ROWS",50)),
  max_buffer     = 50000,
  dedup_ttl      = 600,
  model_path     = "models/iso_forest_v1.rds",
  stream_name    = "soc_logs",
  checkpoint_key = "detector:last_id",
  throttle_sec   = as.numeric(Sys.getenv("THROTTLE_SEC",0.02)),
  alert_limit    = as.numeric(Sys.getenv("ALERT_LIMIT",1000))
)

log_threshold(INFO)

# ---------- DETECTOR ----------
SOCDetector <- R6::R6Class("SOCDetector",

public = list(

  model=NULL,
  last_train=NULL,
  buffer=NULL,
  redis=NULL,
  mongo=NULL,
  model_ver="none",
  scale_center=NULL,
  scale_scale=NULL,

  initialize=function(){
    self$buffer <- tibble()
    self$connect_services()
    self$load_existing_model()
  },

# ---------- CONNECTIONS ----------

connect_services=function(){

  tryCatch({
    self$redis <- new(Redis,conf$redis_host,conf$redis_port)
  },error=function(e){
    log_warn("Redis connection failed")
  })

  tryCatch({
    self$mongo <- mongo("alerts",db="soc",url=conf$mongo_uri)
  },error=function(e){
    log_warn("Mongo connection failed")
  })

},

safe_redis_exec=function(cmd){

  tryCatch({

    if(is.null(self$redis))
      self$connect_services()

    self$redis$exec(cmd)

  },error=function(e){

    log_warn("Redis reconnect triggered")
    self$connect_services()
    NULL

  })
},

safe_mongo_insert=function(df){

  tryCatch({

    if(is.null(self$mongo))
      self$mongo <- mongo("alerts",db="soc",url=conf$mongo_uri)

    self$mongo$insert(df)

  },error=function(e){

    log_warn("Mongo reconnect triggered")
    self$mongo <- mongo("alerts",db="soc",url=conf$mongo_uri)

  })
},

# ---------- FEATURE ENGINEERING ----------

enrich_features=function(df){

  if(nrow(df)==0) return(df)

  df %>%
    mutate(
      timestamp=suppressWarnings(
        as.POSIXct(as.numeric(timestamp),
                   origin="1970-01-01",
                   tz="UTC")),
      failed_logins=suppressWarnings(as.numeric(failed_logins))
    ) %>%
    filter(!is.na(timestamp),!is.na(failed_logins)) %>%
    mutate(
      hour=hour(timestamp),
      is_weekend=as.integer(wday(timestamp) %in% c(1,7))
    )

},

# ---------- MODEL TRAINING ----------

train=function(){

  train_data <- self$buffer %>%
    filter(timestamp>=Sys.time()-minutes(conf$window_mins))

  # require a minimum number of rows before we bother training
  if(nrow(train_data) < conf$train_min_rows) return(NULL)

  log_info("Training model on {nrow(train_data)} rows (window={conf$window_mins}m)")

  self$scale_center <- attr(scaled,"scaled:center")
  self$scale_scale  <- attr(scaled,"scaled:scale")

  self$model <- isolation.forest(scaled,ntrees=100,ndim=1)

  self$last_train <- Sys.time()

  self$model_ver <- paste0(
    "iso_v1_",
    format(self$last_train,"%Y%m%d_%H%M")
  )

  if(!dir.exists("models"))
    dir.create("models")

  saveRDS(list(
    model=self$model,
    center=self$scale_center,
    scale=self$scale_scale
  ),conf$model_path)

},

load_existing_model=function(){

  if(file.exists(conf$model_path)){

    obj <- readRDS(conf$model_path)

    self$model <- obj$model
    self$scale_center <- obj$center
    self$scale_scale  <- obj$scale

    self$last_train <- file.info(conf$model_path)$mtime

    self$model_ver <- paste0(
      "iso_v1_",
      format(self$last_train,"%Y%m%d_%H%M")
    )

    log_info("Loaded model {self$model_ver}")

  }

},

# ---------- STREAM READING ----------

process_stream=function(){

  last_id <- self$get_checkpoint()

  cmd <- paste(
    "XREAD COUNT 100 BLOCK 2000 STREAMS",
    conf$stream_name,
    last_id
  )

  raw <- self$safe_redis_exec(cmd)

  entries <- tryCatch(raw[[1]][[2]],error=function(e)NULL)

  if(is.null(entries)||length(entries)==0) return(NULL)

  rows <- lapply(entries,function(e){

    entry_id <- e[[1]]
    fields <- e[[2]]

    data <- list()
    i<-1

    while(i<length(fields)){

      data[[fields[[i]]]] <- fields[[i+1]]
      i<-i+2

    }

    data$entry_id <- entry_id
    data

  }) %>% bind_rows()

  self$handle_batch(rows)

  Sys.sleep(conf$throttle_sec)

},

# ---------- PROCESS BATCH ----------

handle_batch=function(df){

  enriched <- self$enrich_features(df)

  if(nrow(enriched)==0) return(NULL)

  self$buffer <- bind_rows(self$buffer,enriched) %>%
    filter(timestamp>=Sys.time()-minutes(conf$window_mins))

  if(nrow(self$buffer)>conf$max_buffer)
    self$buffer <- tail(self$buffer,conf$max_buffer)

  if(is.null(self$model) ||
     difftime(Sys.time(),self$last_train,
              units="mins")>conf$retrain_mins){

    self$train()

  }

  if(!is.null(self$model)){

    feats <- enriched %>%
      select(failed_logins,hour,is_weekend)

    scaled <- scale(feats,
                    center=self$scale_center,
                    scale=self$scale_scale)

    scores <- predict(self$model,scaled)

    self$generate_alerts(enriched,scores)

  }

  self$set_checkpoint(df$entry_id[nrow(df)])

},

# ---------- ALERT GENERATION ----------

generate_alerts=function(df,scores){

  alerts <- list()

  for(i in seq_len(nrow(df))){

    score_val <- scores[i]

    if(!(score_val>0.75 |
       (df$failed_logins[i] %||% 0)>20))
      next

    user_val <- df$user[i] %||% "unknown"
    ip_val   <- df$ip[i]   %||% "0.0.0.0"
    host_val <- df$hostname[i] %||% "unknown"

    hash_key <- digest(
      paste(user_val,ip_val,floor(score_val*10))
    )

    if(self$is_duplicate(hash_key))
      next

    self$mark_duplicate(hash_key)

    alerts[[length(alerts)+1]] <- list(

      timestamp=df$timestamp[i],
      user=user_val,
      ip=ip_val,
      hostname=host_val,
      score=score_val,
      severity=if(score_val>0.85)"critical" else "high",
      model_ver=self$model_ver

    )

  }

  if(length(alerts)==0) return()

  if(length(alerts)>conf$alert_limit){

    log_warn("Alert spike detected, truncating batch")
    alerts <- alerts[1:conf$alert_limit]

  }

  self$safe_mongo_insert(bind_rows(alerts))

},

# ---------- REDIS HELPERS ----------

get_checkpoint=function(){

  id <- self$safe_redis_exec(
    paste("GET",conf$checkpoint_key)
  )

  id %||% "0-0"

},

set_checkpoint=function(id){

  self$safe_redis_exec(
    paste("SET",conf$checkpoint_key,id)
  )

},

is_duplicate=function(h){

  (self$safe_redis_exec(
    paste("EXISTS",paste0("dedup:",h))
  ) %||% 0)==1

},

mark_duplicate=function(h){

  self$safe_redis_exec(
    paste("SETEX",
          paste0("dedup:",h),
          conf$dedup_ttl,
          "1")
  )

}

))

# ---------- MAIN LOOP ----------

detector <- SOCDetector$new()

running <- TRUE
error_count <- 0

log_info("SOC detector started")

withCallingHandlers({

  while(running){

    tryCatch({

      detector$process_stream()
      error_count <- 0

    },error=function(e){

      error_count <<- error_count+1

      log_error("Loop error: {e$message}")

      if(error_count>10){

        log_fatal("Too many errors, shutting down")
        running <<- FALSE

      }

      Sys.sleep(min(30,2^error_count))

    })

  }

},interrupt=function(e){

  log_info("Graceful shutdown")
  running <<- FALSE

})

log_info("Detector stopped")