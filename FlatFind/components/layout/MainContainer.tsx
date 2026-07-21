// Mirrors #main (index (1).html, MAIN block) — the shared content wrapper
// every tab pane sat inside. Desktop: 32px/28px/60px padding. Mobile
// (<=700px): 20px/16px/50px, per the original's MOBILE block.
export function MainContainer({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-7 pb-[60px] pt-8 mobile:px-4 mobile:pb-[50px] mobile:pt-5">
      {children}
    </main>
  );
}
