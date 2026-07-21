export default function AppLoading(): React.JSX.Element {
  return (
    <section className="route-loading" aria-busy="true" aria-live="polite">
      <span className="sr-only">Inhalt wird geladen</span>
      <div className="route-loading-heading" />
      <div className="route-loading-subtitle" />
      <div className="route-loading-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="route-loading-card" key={index} />
        ))}
      </div>
      <div className="route-loading-panel" />
    </section>
  );
}
