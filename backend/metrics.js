let cache = null;
let cacheTime = 0;

// number of milliseconds to cache results; set to 0 to disable caching entirely
// default is 0 so that alerts/min always reflects the current minute
const CACHE_MS = Number(process.env.METRICS_CACHE_MS || 0);

export async function getMetrics(alerts) {
  if (CACHE_MS > 0 && Date.now() - cacheTime < CACHE_MS && cache) {
    return cache;
  }

  try {
    const [total, perSeverityRaw, alertsPerMin] = await Promise.all([
      alerts.countDocuments(),
      alerts.aggregate([{ $group: { _id: "$severity", count: { $sum: 1 } } }]).toArray(),
      alerts.countDocuments({ timestamp: { $gte: new Date(Date.now() - 60_000) } })
    ]);

    const perSeverity = perSeverityRaw.map(x => ({ name: x._id, value: x.count }));

    cache = { total, perSeverity, alertsPerMin };
    cacheTime = Date.now();

    return cache;
  } catch (err) {
    console.error("Metrics error", err);
    return { total: 0, perSeverity: [], alertsPerMin: 0 };
  }
}