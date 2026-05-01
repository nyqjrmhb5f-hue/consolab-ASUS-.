export default function ChannelSection({
  eyebrow,
  title,
  description,
  cards = [],
  children
}) {
  return (
    <section className="channel">
      <div className="channel-header">
        <div>
          <p className="channel-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <p className="channel-description">{description}</p>
      </div>
      {cards.length > 0 ? (
        <div className="channel-grid">
          {cards.map((card) => (
            <article key={card.label} className={`signal-card tone-${card.tone || "neutral"}`}>
              <p className="signal-label">{card.label}</p>
              <p className="signal-value">{card.value}</p>
            </article>
          ))}
        </div>
      ) : null}
      {children ? <div className="channel-body">{children}</div> : null}
    </section>
  );
}
