export function BrandMark(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      fill="none"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#1666ff" height="100" rx="25" width="100" />
      <path
        d="M27 39V61a21 21 0 0 0 42 0V41"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth="11.5"
      />
      <circle cx="69" cy="29" fill="none" r="8.3" stroke="#ffffff" strokeWidth="7.3" />
    </svg>
  );
}

export function AnimatedBrandMark(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="animated-brand-mark"
      fill="none"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#1666ff" height="100" rx="25" width="100" />
      <path
        className="animated-brand-mark__track"
        d="M27 39V61a21 21 0 0 0 42 0V41"
        pathLength="100"
      />
      <path
        className="animated-brand-mark__route"
        d="M27 39V61a21 21 0 0 0 42 0V41"
        pathLength="100"
      />
      <circle className="animated-brand-mark__destination" cx="69" cy="29" r="8.3" />
    </svg>
  );
}

export function Brand(): React.JSX.Element {
  return (
    <div aria-label="uroute" className="brand" role="img">
      <BrandMark />

      <span className="brand__wordmark">
        <span className="brand__initial">u</span>route
      </span>
    </div>
  );
}
