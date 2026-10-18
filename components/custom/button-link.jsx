import { Button } from "@/components/ui/button"

export default function ButtonLink({ href, children, ...props }) {
  return (
    <Button
      nativeButton={false}
      render={<a href={href} />}
      role="link"
      {...props}
    >
      {children}
    </Button>
  )
}
