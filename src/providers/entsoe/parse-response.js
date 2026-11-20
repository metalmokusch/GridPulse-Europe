export function parseEntsoeResponse(xml) {
  const cleanXml = xml.replace(/<!--[\s\S]*?-->/g, '');
  const tags = (name) => [...cleanXml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'gi'))]
    .map((match) => match[1].replace(/<[^>]+>/g, '').trim());
  const timeSeries = [...cleanXml.matchAll(/<TimeSeries\b[^>]*>([\s\S]*?)<\/TimeSeries>/gi)].map(([, seriesXml]) => {
    const category = seriesXml.match(/<psrType>([^<]+)<\/psrType>/i)?.[1]?.trim() ?? null;
    const periods = [...seriesXml.matchAll(/<Period\b[^>]*>([\s\S]*?)<\/Period>/gi)].map(([, periodXml]) => {
      const startUtc = periodXml.match(/<start>([^<]+)<\/start>/i)?.[1]?.trim();
      const endUtc = periodXml.match(/<end>([^<]+)<\/end>/i)?.[1]?.trim();
      const interval = periodXml.match(/<timeInterval>([^<]+)<\/timeInterval>/i)?.[1]?.trim();
      const [intervalStart, intervalEnd] = interval?.split('/') ?? [];
      const positions = [...periodXml.matchAll(/<position>(\d+)<\/position>/gi)].map(([, value]) => Number(value));
      return {
        start_utc: startUtc ?? intervalStart ?? null,
        end_utc: endUtc ?? intervalEnd ?? null,
        resolution: periodXml.match(/<resolution>([^<]+)<\/resolution>/i)?.[1]?.trim() ?? null,
        point_count: positions.length,
        first_position: positions.length ? Math.min(...positions) : null,
        last_position: positions.length ? Math.max(...positions) : null
      };
    });
    return { category, periods };
  });
  const timeSeriesCount = timeSeries.length;
  const pointCount = timeSeries.reduce((total, series) => total + series.periods.reduce((sum, period) => sum + period.point_count, 0), 0);
  const categories = [...new Set(timeSeries.map(({ category }) => category).filter(Boolean))];
  const resolutions = [...new Set(timeSeries.flatMap(({ periods }) => periods.map(({ resolution }) => resolution).filter(Boolean)))];
  const categoryCoverage = [...new Set(timeSeries.map(({ category }) => category).filter(Boolean))].map((category) => {
    const periods = timeSeries.filter((series) => series.category === category).flatMap((series) => series.periods);
    const counts = periods.map(({ point_count }) => point_count);
    return {
      category,
      timeseries_count: timeSeries.filter((series) => series.category === category).length,
      period_count: periods.length,
      point_count: counts.reduce((sum, count) => sum + count, 0),
      periods: periods.map(({ start_utc, end_utc, resolution, point_count }) => ({ start_utc, end_utc, resolution, point_count }))
    };
  });
  const durationMinutes = (value) => {
    const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    return match ? Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0) + Number(match[3] ?? 0) / 60 : null;
  };
  return {
    document_type: tags('type')[0] ?? null,
    response_code: tags('code')[0] ?? null,
    response_text: tags('text')[0] ?? null,
    timeseries_count: timeSeriesCount,
    point_count: pointCount,
    categories,
    resolutions: [...new Set(resolutions)],
    resolution_minutes: [...new Set(resolutions.map(durationMinutes))],
    reported_periods: timeSeries.flatMap(({ periods }) => periods.map(({ start_utc, end_utc }) => ({ start_utc, end_utc }))),
    category_coverage: categoryCoverage,
    series: timeSeries
  };
}
