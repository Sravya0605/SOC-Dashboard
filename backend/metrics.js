let cache = null;
let cacheTime = 0;

export async function getMetrics(alerts) {
  if (Date.now() - cacheTime < 5000 && cache) return cache;

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