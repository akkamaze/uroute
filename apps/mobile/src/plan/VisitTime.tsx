interface VisitTimeProps {
  className?: string;
  time: string;
}

export function VisitTime({ className, time }: VisitTimeProps): React.JSX.Element {
  if (time.length > 0) {
    return <span className={className}>{time}</span>;
  }

  const unsetClassName =
    className === undefined ? "visit-time--unset" : `${className} visit-time--unset`;

  return (
    <span aria-label="No time set" className={unsetClassName}>
      <span aria-hidden="true" className="visit-time__unset-anchor">
        <span className="visit-time__unset-reference">00:00</span>
        <span className="visit-time__unset-mark" />
      </span>
    </span>
  );
}
