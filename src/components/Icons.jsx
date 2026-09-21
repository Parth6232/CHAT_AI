const icon = (paths) =>
  function Icon(props) {
    return (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {paths}
      </svg>
    )
  }

export const IconSend = icon(<path d="M12 19V5M5 12l7-7 7 7" />)
export const IconStop = icon(<rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none" />)
export const IconPlus = icon(<path d="M12 5v14M5 12h14" />)
export const IconClose = icon(<path d="M6 6l12 12M18 6L6 18" />)
export const IconCheck = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />)
export const IconDown = icon(<path d="M12 5v14M5 12l7 7 7-7" />)
export const IconMoon = icon(<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />)
export const IconSun = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
)
export const IconKey = icon(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
  </>,
)
export const IconRefresh = icon(
  <>
    <path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4" />
  </>,
)
export const IconCopy = icon(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </>,
)
