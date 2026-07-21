// Required by Next.js parallel routes: when the current URL doesn't match
// anything inside @modal (i.e. we're not on /listings/[id] via in-app
// navigation), this renders nothing instead of an error.
export default function Default() {
  return null;
}
