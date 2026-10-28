export function GettingStarted({
  onNavigate,
  onDismiss,
}: {
  onNavigate: (group: string, id?: string) => void;
  onDismiss: () => void;
}) {
  return (
    <section className="getting-started" aria-labelledby="getting-started-title">
      <div>
        <div className="eyebrow">START HERE</div>
        <h2 id="getting-started-title">Turn the blank canvas into your story.</h2>
        <p>
          The starter scene is valid and playable. Replace it when you are ready;
          nothing from the examples was copied into this project.
        </p>
      </div>
      <ol>
        <li>
          <button onClick={() => onNavigate("settings")}>Name and theme</button>
          <span>Set the title, colors and reading font.</span>
        </li>
        <li>
          <button onClick={() => onNavigate("settings")}>Define resources</button>
          <span>Add, rename or remove the meters players manage.</span>
        </li>
        <li>
          <button onClick={() => onNavigate("cards")}>Write the first card</button>
          <span>Replace the placeholder scene and its two choices.</span>
        </li>
        <li>
          <button onClick={() => onNavigate("endings")}>Set an ending</button>
          <span>Give the fallback ending your own words.</span>
        </li>
      </ol>
      <button className="dismiss-start" onClick={onDismiss}>
        Dismiss checklist
      </button>
    </section>
  );
}
