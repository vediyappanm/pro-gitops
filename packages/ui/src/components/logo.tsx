import { ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M10 1L19 19H15.5L10 6.5L4.5 19H1L10 1Z" fill="var(--icon-brand-base)" />
      <rect x="5.5" y="13" width="9" height="2.5" rx="0.5" fill="var(--icon-brand-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M50 5L96 95H78L50 32L22 95H4L50 5Z" fill="var(--icon-brand-base)" />
      <rect x="26" y="66" width="48" height="12" rx="2" fill="var(--icon-brand-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 300 60"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g fill="var(--icon-brand-base)">
        {/* A */}
        <path d="M20 6L36 54H30L20 22L10 54H4L20 6Z" />
        <rect x="9" y="40" width="22" height="5" rx="1" />

        {/* R */}
        <path d="M46 6H61C66 6 68.5 9 68.5 14C68.5 18 66.5 21 63 22.5L71 54H65.5L58.5 23.5H51.5V54H46V6ZM51.5 11V19H61C63 19 64 17.5 64 15C64 12.5 63 11 61 11H51.5Z" />

        {/* C */}
        <path d="M98 17C98 13 96 10.5 91 10.5H80C75 10.5 73 13 73 17V43C73 47 75 49.5 80 49.5H91C96 49.5 98 47 98 43V39.5H93.5V43C93.5 44.5 92.5 45 91 45H80C78.5 45 77.5 44.5 77.5 43V17C77.5 15.5 78.5 15 80 15H91C92.5 15 93.5 15.5 93.5 17V20.5H98V17Z" />

        {/* H */}
        <path d="M107 6V54H112V33H126V54H131V6H126V28.5H112V6H107Z" />

        {/* O */}
        <path d="M149 6C143.5 6 141 9 141 14V46C141 51 143.5 54 149 54H162C167.5 54 170 51 170 46V14C170 9 167.5 6 162 6H149ZM145.5 14C145.5 12 147 11 149 11H162C164 11 165.5 12 165.5 14V46C165.5 48 164 49 162 49H149C147 49 145.5 48 145.5 46V14Z" />

        {/* N */}
        <path d="M179 6V54H184L201 24V54H206V6H201L184 36V6H179Z" />
      </g>
    </svg>
  )
}
