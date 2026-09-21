/** The living orb: drifts slowly at rest, churns faster while a reply streams in. */
export default function Orb({ busy = false, size = 140 }) {
  return (
    <div className={`orb${busy ? ' busy' : ''}`} style={{ '--size': `${size}px` }} aria-hidden="true">
      <span className="orb-blob orb-a" />
      <span className="orb-blob orb-b" />
      <span className="orb-blob orb-c" />
      <span className="orb-shine" />
    </div>
  )
}
