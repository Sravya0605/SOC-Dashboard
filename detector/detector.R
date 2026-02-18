library(mongolite)
library(dplyr)
library(lubridate)
library(isotree)
library(digest)
library(jsonlite)
library(RcppRedis)   # ← FIXED: correct Redis client

# ---------- ENV ----------
mongo_uri  <- "mongodb://127.0.0.1:27017"
redis_host <- "127.0.0.1"
redis_port <- 6379
dedup_salt <- "supersecret"

WINDOW_MINUTES  <- 30
RETRAIN_MINUTES <- 10
DEDUP_TTL_SEC   <- 600
MAX_BUFFER_ROWS <- 50000

MODEL_PATH <- "model.rds"
CHECKPOINT_KEY <- "detector:last_id"

# ---------- LOGGING ----------
log_json <- function(level, msg) {
  cat(toJSON(list(level = level, time = as.character(Sys.time()), msg = msg),
             auto_unbox = TRUE), "\n")
}

# ---------- CONNECTIONS ----------
alerts_db <- mongo("alerts", db = "soc", url = mongo_uri)

redis <- tryCatch({
  r <- new(Redis, redis_host, redis_port)
  log_json("info", "Connected to Redis")
  r
}, error = function(e) {
  log_json("error", paste("Redis connection failed:", e$message))
  NULL
})

# ---------- MODEL ----------
train_model <- function(df) {
  if (nrow(df) < 50) return(NULL)
  isolation.forest(df[, c("failed_logins", "hour")], ntrees = 100)
}

save_model <- function(m) saveRDS(m, MODEL_PATH)
load_model <- function() if (file.exists(MODEL_PATH)) readRDS(MODEL_PATH) else NULL

score_severity <- function(score, fails) {
  base <- case_when(score > 0.75 ~ 3, score > 0.6 ~ 2, TRUE ~ 1)
  total <- base + ifelse(fails >= 5, 1, 0)

  case_when(
    total >= 4 ~ "critical",
    total == 3 ~ "high",
    total == 2 ~ "medium",
    TRUE ~ "low"
  )
}

# ---------- DEDUP (via Redis) ----------
is_duplicate <- function(hash) {
  if (is.null(redis)) return(FALSE)
  tryCatch({
    res <- redis$exec(paste("EXISTS", paste0("dedup:", hash)))
    as.numeric(res) == 1
  }, error = function(e) FALSE)
}

store_hash <- function(hash) {
  if (is.null(redis)) return()
  tryCatch({
    redis$exec(paste("SETEX", paste0("dedup:", hash), DEDUP_TTL_SEC, "1"))
  }, error = function(e) {})
}

# ---------- CHECKPOINT ----------
get_last_id <- function() {
  if (is.null(redis)) return("0-0")
  tryCatch({
    id <- redis$exec(paste("GET", CHECKPOINT_KEY))
    if (is.null(id)) "0-0" else id
  }, error = function(e) "0-0")
}

set_last_id <- function(id) {
  if (is.null(redis)) return()
  tryCatch({
    redis$exec(paste("SET", CHECKPOINT_KEY, id))
  }, error = function(e) {})
}

# ---------- STATE ----------
iso_model <- load_model()
last_train_time <- Sys.time()

log_buffer <- tibble(
  timestamp = as.POSIXct(character()),
  failed_logins = numeric(),
  hour = numeric()
)

running <- TRUE
error_count <- 0
MAX_ERRORS <- 10

base::addTaskCallback(function(...) TRUE)
withCallingHandlers({ NULL }, interrupt = function(e) {
  running <<- FALSE
})

log_json("info", "Detector started")

# ---------- LOOP ----------
while (running) {

  tryCatch({

    if (is.null(redis)) {
      Sys.sleep(3)
      next
    }

    last_id <- get_last_id()

    # ---------- XREAD ----------
    msgs <- tryCatch({
      redis$exec(
        paste("XREAD COUNT 100 BLOCK 2000 STREAMS soc_logs", last_id)
      )
    }, error = function(e) {
      log_json("error", paste("XREAD error:", e$message))
      Sys.sleep(0.5)
      NULL
    })

    if (is.null(msgs) || length(msgs) == 0) next

    # ---------- PARSE STREAM ----------
    records <- list()
    entry_ids <- c()

    entries <- msgs[[1]][[2]]

    for (entry in entries) {

      entry_id <- entry[[1]]
      fields_list <- entry[[2]]

      data_list <- list()
      j <- 1
      while (j < length(fields_list)) {
        data_list[[fields_list[[j]]]] <- fields_list[[j + 1]]
        j <- j + 2
      }

      record <- as.data.frame(data_list, stringsAsFactors = FALSE)
      records[[length(records) + 1]] <- record
      entry_ids <- c(entry_ids, entry_id)
    }

    if (length(records) == 0) next

    new_logs <- bind_rows(records)

    # ---------- CHECKPOINT ----------
    set_last_id(entry_ids[length(entry_ids)])

    # ---------- TYPE CONVERSION ----------
    new_logs$timestamp <- as.POSIXct(as.numeric(new_logs$timestamp),
                                     origin = "1970-01-01", tz = "UTC")
    new_logs$failed_logins <- as.numeric(new_logs$failed_logins)
    new_logs$hour <- hour(new_logs$timestamp)

    # ---------- BUFFER ----------
    log_buffer <- bind_rows(log_buffer, new_logs)

    cutoff <- Sys.time() - minutes(WINDOW_MINUTES)
    log_buffer <- log_buffer %>% filter(timestamp >= cutoff)

    if (nrow(log_buffer) > MAX_BUFFER_ROWS)
      log_buffer <- tail(log_buffer, MAX_BUFFER_ROWS)

    # ---------- RETRAIN ----------
    if (is.null(iso_model) ||
        difftime(Sys.time(), last_train_time, units = "mins") > RETRAIN_MINUTES) {

      model <- train_model(log_buffer)

      if (!is.null(model)) {
        iso_model <- model
        last_train_time <- Sys.time()
        save_model(model)
        log_json("info", "Model retrained")
      }
    }

    if (is.null(iso_model)) next

    # ---------- SCORING ----------
    scores <- predict(iso_model, new_logs[, c("failed_logins", "hour")])

    alerts <- list()

    for (i in seq_len(nrow(new_logs))) {

      sev <- score_severity(scores[i], new_logs$failed_logins[i])
      if (sev == "low") next

      hash <- digest(paste(new_logs$user[i], new_logs$ip[i], sev, dedup_salt))

      if (is_duplicate(hash)) next
      store_hash(hash)

      alerts[[length(alerts) + 1]] <- list(
        timestamp = new_logs$timestamp[i],
        user = new_logs$user[i],
        ip = new_logs$ip[i],
        failed_logins = new_logs$failed_logins[i],
        anomaly_score = scores[i],
        severity = sev
      )
    }

    if (length(alerts) > 0) {
      alerts_db$insert(bind_rows(alerts))
      log_json("info", paste("Stored", length(alerts), "alerts"))
    }

    error_count <- 0

  }, error = function(e) {

    error_count <<- error_count + 1
    log_json("error", e$message)

    if (error_count >= MAX_ERRORS) {
      log_json("error", "Too many errors, shutting down")
      running <<- FALSE
    }

    Sys.sleep(min(30, 2 ^ error_count))
  })
}

log_json("info", "Detector stopped")
