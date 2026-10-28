import { useState } from "react";
import type { Project } from "./TeamWorkspace";
import {
  assetBytes,
  assetUses,
  cropImage,
  dataUrl,
  imageAsset,
  readImage,
  replaceAssetReferences,
  type Crop,
} from "./imageAssets";

const defaultCrop: Crop = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  maxEdge: 1600,
  quality: 0.85,
};
export function AssetLibrary({
  project,
  update,
  navigate,
  initialId,
}: {
  project: Project;
  update: (fn: (g: any, p: Project) => void) => void;
  navigate: (group: string, id?: string) => void;
  initialId?: string;
}) {
  const g = project.game,
    readOnly = project.remote?.role === "viewer";
  const [selected, select] = useState(initialId || ""),
    [search, setSearch] = useState("");
  const [unused, setUnused] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [crop, setCrop] = useState(defaultCrop),
    [replaceUses, setReplaceUses] = useState(true),
    [replacement, setReplacement] = useState("");
  const item =
    g.assets.find((a: any) => a.id === selected && a.kind === "image") ||
    g.assets.find((a: any) => a.kind === "image");
  const uses = item ? assetUses(g, item.id) : [];
  const total = Object.values(project.images).reduce(
    (n, value) => n + assetBytes(value),
    0,
  );
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="asset-library">
      <h2>Your image library</h2>
      <p>
        Reuse images across cards and endings. Cropping creates a new variant;
        originals stay in the library and in your backups.
      </p>
      <p className="hint">
        {g.assets.length} / 200 shared assets · {(total / 1_000_000).toFixed(2)}{" "}
        / 10 MB shared image budget. Unused originals also count toward storage
        and exports.
      </p>
      {message && <p role="status">{message}</p>}
      <fieldset disabled={readOnly || busy}>
        <label>
          Add images (PNG, JPEG or WebP; up to 5 MB each)
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (files.length)
                void run(async () => {
                  if (g.assets.length + files.length > 200)
                    throw Error(
                      "A shared project supports at most 200 assets.",
                    );
                  if (files.reduce((n, f) => n + f.size, total) > 50_000_000)
                    throw Error(
                      "This upload would exceed the 50 MB local image budget. Upload smaller images.",
                    );
                  const additions: {
                    asset: ReturnType<typeof imageAsset>;
                    data: string;
                  }[] = [];
                  for (const file of files)
                    additions.push({
                      asset: imageAsset(file, file.name),
                      data: await readImage(file),
                    });
                  update((game, p) => {
                    if (game.assets.length + additions.length > 200)
                      throw Error("Asset limit exceeded.");
                    for (const next of additions) {
                      game.assets.push(next.asset);
                      p.images[next.asset.id] = next.data;
                    }
                  });
                  select(additions[0].asset.id);
                  setCrop(defaultCrop);
                  setMessage(
                    `Added ${additions.length} image(s). Use them from a card's Library image selector.`,
                  );
                });
            }}
          />
        </label>
      </fieldset>
      <label>
        Find an image
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filename, ID, credit…"
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={unused}
          onChange={(e) => setUnused(e.target.checked)}
        />
        Show unused images only
      </label>
      <div className="asset-grid">
        {g.assets
          .filter(
            (a: any) =>
              a.kind === "image" &&
              `${a.id} ${a.path} ${a.credit || ""}`
                .toLowerCase()
                .includes(search.toLowerCase()) &&
              (!unused || !assetUses(g, a.id).length),
          )
          .map((a: any) => (
            <button
              className={a.id === item?.id ? "selected" : ""}
              key={a.id}
              onClick={() => {
                select(a.id);
                setCrop(defaultCrop);
                setReplacement("");
              }}
            >
              <img src={project.images[a.id]} alt="" loading="lazy" />
              <span>{a.path.split("/").pop()}</span>
              <small>
                {assetUses(g, a.id).length} uses ·{" "}
                {(assetBytes(project.images[a.id]) / 1000).toFixed(0)} KB
              </small>
            </button>
          ))}
      </div>
      {item && (
        <section className="asset-detail">
          <h3>{item.path.split("/").pop()}</h3>
          <p className="hint">Stable image ID: {item.id}</p>
          <div className="asset-uses">
            <b>Used by</b>
            {uses.length ? (
              uses.map((use, i) => (
                <button key={i} onClick={() => navigate(use.group, use.id)}>
                  {use.label}
                </button>
              ))
            ) : (
              <p>Not currently referenced. You can reuse it or delete it.</p>
            )}
          </div>
          <fieldset disabled={readOnly || busy}>
            <label>
              Credit
              <input
                maxLength={1000}
                value={item.credit || ""}
                onChange={(e) =>
                  update((game) => {
                    game.assets.find((a: any) => a.id === item.id).credit =
                      e.target.value;
                  })
                }
              />
            </label>
            <label>
              License / permission note
              <input
                maxLength={1000}
                value={item.license || ""}
                onChange={(e) =>
                  update((game) => {
                    game.assets.find((a: any) => a.id === item.id).license =
                      e.target.value;
                  })
                }
              />
            </label>
            <details>
              <summary>Replace all uses with another library image</summary>
              <label>
                Replacement
                <select
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                >
                  <option value="">Select an image</option>
                  {g.assets
                    .filter((a: any) => a.kind === "image" && a.id !== item.id)
                    .map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.path.split("/").pop()}
                      </option>
                    ))}
                </select>
              </label>
              <button
                disabled={!replacement || !uses.length}
                onClick={() =>
                  update((game) => {
                    if (!game.assets.some((a: any) => a.id === replacement))
                      throw Error("Replacement image no longer exists.");
                    replaceAssetReferences(game, item.id, replacement);
                  })
                }
              >
                Replace references · keep original
              </button>
            </details>
            <details>
              <summary>Crop and optimize a new variant</summary>
              <div className="crop-preview">
                <img
                  src={project.images[item.id]}
                  alt="Source image with crop selection"
                />
                <div
                  style={{
                    left: crop.x + "%",
                    top: crop.y + "%",
                    width: crop.width + "%",
                    height: crop.height + "%",
                  }}
                />
              </div>
              <div className="crop-fields">
                {(["x", "y", "width", "height"] as const).map((key) => (
                  <label key={key}>
                    {
                      { x: "Left", y: "Top", width: "Width", height: "Height" }[
                        key
                      ]
                    }{" "}
                    (%)
                    <input
                      type="range"
                      min={key === "x" || key === "y" ? 0 : 1}
                      max={key === "x" || key === "y" ? 99 : 100}
                      value={crop[key]}
                      onChange={(e) =>
                        setCrop((old) => {
                          const next = {
                            ...old,
                            [key]: Number(e.target.value),
                          };
                          next.width = Math.min(next.width, 100 - next.x);
                          next.height = Math.min(next.height, 100 - next.y);
                          return next;
                        })
                      }
                    />
                    <output>{crop[key]}%</output>
                  </label>
                ))}
              </div>
              <label>
                Longest output edge (pixels)
                <input
                  type="number"
                  min={128}
                  max={4096}
                  value={crop.maxEdge}
                  onChange={(e) =>
                    setCrop({ ...crop, maxEdge: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                WebP quality
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={crop.quality}
                  onChange={(e) =>
                    setCrop({ ...crop, quality: Number(e.target.value) })
                  }
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={replaceUses}
                  onChange={(e) => setReplaceUses(e.target.checked)}
                />
                Use the new variant wherever this image is used
              </label>
              <button
                onClick={() =>
                  void run(async () => {
                    const blob = await cropImage(project.images[item.id], crop);
                    if (blob.size > 5_000_000)
                      throw Error(
                        "Variant exceeds 5 MB. Reduce dimensions or quality.",
                      );
                    const next = {
                        ...imageAsset(
                          blob,
                          "crop-" + item.path.split("/").pop(),
                        ),
                        credit: item.credit || "",
                        license: item.license || "",
                      },
                      data = await dataUrl(blob);
                    update((game, p) => {
                      if (game.assets.length >= 200)
                        throw Error(
                          "Asset limit exceeded; remove an unused image first.",
                        );
                      if (!game.assets.some((a: any) => a.id === item.id))
                        throw Error(
                          "Source image was removed during cropping.",
                        );
                      game.assets.push(next);
                      p.images[next.id] = data;
                      if (replaceUses)
                        replaceAssetReferences(game, item.id, next.id);
                    });
                    select(next.id);
                    setCrop(defaultCrop);
                    setMessage(
                      `Created ${(blob.size / 1000).toFixed(0)} KB variant. The original is retained.`,
                    );
                  })
                }
              >
                Create cropped variant
              </button>
              <button onClick={() => setCrop(defaultCrop)}>Reset crop</button>
            </details>
            <button
              disabled={!!uses.length}
              title={uses.length ? "Replace or remove references first." : ""}
              onClick={() => {
                if (
                  !window.confirm(
                    "Delete this unused library image? Undo can restore it during this session.",
                  )
                )
                  return;
                update((game, p) => {
                  if (assetUses(game, item.id).length)
                    throw Error("This image is still referenced.");
                  game.assets = game.assets.filter(
                    (a: any) => a.id !== item.id,
                  );
                  delete p.images[item.id];
                });
                select("");
              }}
            >
              Delete unused image
            </button>
          </fieldset>
        </section>
      )}
    </div>
  );
}
