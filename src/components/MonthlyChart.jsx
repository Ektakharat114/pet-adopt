/** Adoptions per month: one series, so no legend. The latest month is labelled on its cap;
 *  every month has a hover/focus tooltip and appears in the "View as table" list. */
export default function MonthlyChart({ data }) {
  const max = Math.max(0, ...data.map((d) => d.count));
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4; // always 4 even steps, whole numbers
  const ticks = [0, 1, 2, 3, 4].map((i) => (top / 4) * i);
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const last = data.length - 1;
  const noun = (n) => (n === 1 ? "adoption" : "adoptions");

  return (
    <figure className="chart">
      <figcaption>
        <strong>Adoptions per month</strong> <span className="muted">· last {data.length} months</span>
      </figcaption>
      <div className="chart-body">
        <div className="chart-plot" role="group" aria-label="Adoptions per month">
          {ticks.map((t) => (
            <div key={t} className="grid-line" style={{ bottom: `${(t / top) * 100}%` }}>
              <span className="tick">{t}</span>
            </div>
          ))}
          <div className="cols">
            {data.map((d, i) => (
              <button key={d.month} type="button" className="col" style={{ "--h": `${(d.count / top) * 100}%` }} aria-label={`${d.label}: ${d.count} ${noun(d.count)}`}>
                <span className="bar-track">
                  <span className="bar" style={{ height: `${(d.count / top) * 100}%` }}>
                    {i === last && d.count > 0 && <span className="bar-value">{d.count}</span>}
                  </span>
                </span>
                <span className="tip" role="tooltip">
                  <strong>{d.count}</strong> {noun(d.count)} · {d.label}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="x-axis" aria-hidden="true">
          {data.map((d) => <span key={d.month}>{d.label}</span>)}
        </div>
      </div>
      {total === 0 && (
        <p className="muted small-text">No adoptions in these months yet. They appear here as applications are approved.</p>
      )}
      <details className="chart-table">
        <summary>View as table</summary>
        <table>
          <thead><tr><th>Month</th><th>Adoptions</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}><td>{d.month}</td><td>{d.count}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
