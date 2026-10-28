import { useReducer, type SetStateAction } from "react";
import type { Project } from "./TeamWorkspace";

type Content = Pick<Project, "game" | "images">;
type History = {
  past: Content[];
  future: Content[];
  group?: Element | null;
  time?: number;
};
type Workspace = {
  projects: Project[];
  histories: Record<string, History>;
  error: string;
};
type Action =
  | { type: "set"; value: SetStateAction<Project[]> }
  | {
      type: "edit";
      id: string;
      mutate: (game: any, project: Project) => void;
      group: Element | null;
      time: number;
    }
  | { type: "undo" | "redo"; id: string };
const content = (p: Project): Content => ({ game: p.game, images: p.images });
export function sameImages(
  a: Record<string, string>,
  b: Record<string, string>,
) {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key])
  );
}

function reduce(state: Workspace, action: Action): Workspace {
  if (action.type === "set") {
    const projects =
      typeof action.value === "function"
        ? action.value(state.projects)
        : action.value;
    const ids = new Set(projects.map((p) => p.draftId));
    return {
      ...state,
      projects,
      error: "",
      histories: Object.fromEntries(
        Object.entries(state.histories).filter(([id]) => ids.has(id)),
      ),
    };
  }
  const index = state.projects.findIndex((p) => p.draftId === action.id);
  if (index < 0) return state;
  const previous = state.projects[index];
  if (previous.remote?.role === "viewer")
    return { ...state, error: "This shared copy is read-only." };
  const history = state.histories[action.id] || { past: [], future: [] };
  let next: Project, updated: History;
  if (action.type === "edit") {
    next = {
      ...previous,
      game: structuredClone(previous.game),
      images: { ...previous.images },
    };
    try {
      action.mutate(next.game, next);
    } catch (error) {
      return { ...state, error: (error as Error).message };
    }
    if (
      JSON.stringify(next.game) === JSON.stringify(previous.game) &&
      sameImages(next.images, previous.images)
    )
      return state;
    const coalesce =
      action.group &&
      history.group === action.group &&
      action.time - (history.time || 0) < 1000;
    updated = {
      past: coalesce
        ? history.past
        : [...history.past.slice(-39), content(previous)],
      future: [],
      group: action.group,
      time: action.time,
    };
  } else {
    const source = action.type === "undo" ? history.past : history.future;
    if (!source.length) return state;
    // Undo content only: never roll back membership or the server's optimistic-lock revision.
    const saved = source[source.length - 1];
    next = {
      ...previous,
      game: structuredClone(saved.game),
      images: { ...saved.images },
    };
    updated =
      action.type === "undo"
        ? {
            past: history.past.slice(0, -1),
            future: [...history.future, content(previous)],
          }
        : {
            past: [...history.past, content(previous)],
            future: history.future.slice(0, -1),
          };
  }
  if (next.remote) next.remote = { ...next.remote, dirty: true };
  const projects = [...state.projects];
  projects[index] = next;
  return {
    projects,
    histories: { ...state.histories, [action.id]: updated },
    error: "",
  };
}

export function useProjectHistory() {
  const [state, dispatch] = useReducer(reduce, {
    projects: [],
    histories: {},
    error: "",
  });
  return {
    ...state,
    saveProjects: (value: SetStateAction<Project[]>) =>
      dispatch({ type: "set", value }),
    editProject: (
      id: string,
      mutate: (g: any, p: Project) => void,
      group: Element | null = null,
    ) => dispatch({ type: "edit", id, mutate, group, time: Date.now() }),
    undo: (id: string) => dispatch({ type: "undo", id }),
    redo: (id: string) => dispatch({ type: "redo", id }),
  };
}
