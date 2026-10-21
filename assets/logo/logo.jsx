export default function Logo({ className, ...props }) {
  return (
    <svg
      viewBox="0 0 160 56"
      width="160"
      height="56"
      fill="none"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="28" cy="28" r="28" className="fill-foreground" />
      <g
        fontFamily="Inter Variable, Inter, Arial, sans-serif"
        fontSize="30"
        fontWeight="750"
        letterSpacing="-1.3"
      >
        <text x="26" y="38" className="fill-background">
          Ja
        </text>
        <text x="55" y="38" className="fill-foreground">
          ptor
        </text>
      </g>
    </svg>
  )
}
