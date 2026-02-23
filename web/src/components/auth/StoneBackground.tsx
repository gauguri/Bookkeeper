export function StoneBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="bedrock-stone-texture absolute inset-0" />
      <div className="absolute -left-28 top-0 h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(186,230,253,0.75)_0%,_rgba(186,230,253,0)_70%)] blur-2xl" />
      <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-[radial-gradient(circle,_rgba(125,211,252,0.55)_0%,_rgba(125,211,252,0)_72%)] blur-2xl" />
    </div>
  );
}
