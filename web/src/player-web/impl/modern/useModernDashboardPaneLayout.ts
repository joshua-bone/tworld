import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { SeriesCatalogEntry } from "@content/api/series";
import type { SetFamily } from "@player-web/impl/modern/curatedCatalog";

export type ResizablePane = "sets" | "levels";

export const DASHBOARD_COLLAPSED_PANE_WIDTH = 44;
export const DASHBOARD_DEFAULT_SETS_PANE_WIDTH = 292;
export const DASHBOARD_DEFAULT_LEVELS_PANE_WIDTH = 276;
export const DASHBOARD_MIN_SETS_PANE_WIDTH = 210;
export const DASHBOARD_MAX_SETS_PANE_WIDTH = 400;
export const DASHBOARD_MIN_LEVELS_PANE_WIDTH = 210;
export const DASHBOARD_MAX_LEVELS_PANE_WIDTH = 400;

export interface DashboardStyle extends CSSProperties {
  "--modern-dashboard-sets-min-width": string;
  "--modern-dashboard-sets-width": string;
  "--modern-dashboard-levels-min-width": string;
  "--modern-dashboard-levels-width": string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function estimateSetsPaneWidth(
  activeFamily: SetFamily | null,
  visibleFamilies: readonly SetFamily[],
): number {
  const longestFamilyTitle = Math.max(
    ...visibleFamilies.map((family) => family.title.length),
    activeFamily?.title.length ?? 0,
    14,
  );
  const longestSidebarSummary = Math.max(
    ...visibleFamilies.map(
      (family) =>
        (family.sidebarSummary?.length ?? 0) +
        (family.yearLabel ? family.yearLabel.length + 3 : 0),
    ),
    18,
  );

  return clamp(
    Math.ceil(Math.max(268, longestFamilyTitle * 8.8 + 72, longestSidebarSummary * 6.8 + 84)),
    DASHBOARD_MIN_SETS_PANE_WIDTH,
    DASHBOARD_MAX_SETS_PANE_WIDTH,
  );
}

export function estimateLevelsPaneWidth(activeEntry: SeriesCatalogEntry | null): number {
  if (!activeEntry) {
    return DASHBOARD_DEFAULT_LEVELS_PANE_WIDTH;
  }

  const longestLevelName = Math.max(...activeEntry.levels.map((level) => level.name.length), 18);
  const densityFloor = 260;
  const sparseSetBuffer = activeEntry.levels.length <= 12 ? 0 : 12;

  return clamp(
    Math.ceil(Math.max(densityFloor, longestLevelName * 6 + 92 + sparseSetBuffer)),
    DASHBOARD_MIN_LEVELS_PANE_WIDTH,
    DASHBOARD_MAX_LEVELS_PANE_WIDTH,
  );
}

export function buildDashboardStyle(
  isSetsPaneCollapsed: boolean,
  setsPaneWidth: number,
  isLevelsPaneCollapsed: boolean,
  levelsPaneWidth: number,
): DashboardStyle {
  return {
    "--modern-dashboard-sets-min-width": `${isSetsPaneCollapsed ? DASHBOARD_COLLAPSED_PANE_WIDTH : DASHBOARD_MIN_SETS_PANE_WIDTH}px`,
    "--modern-dashboard-sets-width": `${isSetsPaneCollapsed ? DASHBOARD_COLLAPSED_PANE_WIDTH : setsPaneWidth}px`,
    "--modern-dashboard-levels-min-width": `${isLevelsPaneCollapsed ? DASHBOARD_COLLAPSED_PANE_WIDTH : DASHBOARD_MIN_LEVELS_PANE_WIDTH}px`,
    "--modern-dashboard-levels-width": `${isLevelsPaneCollapsed ? DASHBOARD_COLLAPSED_PANE_WIDTH : levelsPaneWidth}px`,
  };
}

interface UseModernDashboardPaneLayoutOptions {
  activeEntry: SeriesCatalogEntry | null;
  activeFamily: SetFamily | null;
  isCatalogLoading: boolean;
  visibleFamilies: readonly SetFamily[];
}

interface UseModernDashboardPaneLayoutResult {
  collapseLevelsPane: () => void;
  collapseSetsPane: () => void;
  dashboardStyle: DashboardStyle;
  expandLevelsPane: () => void;
  expandSetsPane: () => void;
  isLevelsPaneCollapsed: boolean;
  isSetsPaneCollapsed: boolean;
  startPaneResize: (pane: ResizablePane, originX: number) => void;
  toggleLevelsPaneCollapsed: () => void;
  toggleSetsPaneCollapsed: () => void;
}

export function useModernDashboardPaneLayout({
  activeEntry,
  activeFamily,
  isCatalogLoading,
  visibleFamilies,
}: UseModernDashboardPaneLayoutOptions): UseModernDashboardPaneLayoutResult {
  const setsPaneManualRef = useRef(false);
  const levelsPaneManualRef = useRef(false);
  const setsPaneWidthRef = useRef(DASHBOARD_DEFAULT_SETS_PANE_WIDTH);
  const levelsPaneWidthRef = useRef(DASHBOARD_DEFAULT_LEVELS_PANE_WIDTH);
  const [isSetsPaneCollapsed, setIsSetsPaneCollapsed] = useState(false);
  const [isLevelsPaneCollapsed, setIsLevelsPaneCollapsed] = useState(false);
  const [setsPaneWidth, setSetsPaneWidth] = useState(DASHBOARD_DEFAULT_SETS_PANE_WIDTH);
  const [levelsPaneWidth, setLevelsPaneWidth] = useState(DASHBOARD_DEFAULT_LEVELS_PANE_WIDTH);

  useEffect(() => {
    setsPaneWidthRef.current = setsPaneWidth;
  }, [setsPaneWidth]);

  useEffect(() => {
    levelsPaneWidthRef.current = levelsPaneWidth;
  }, [levelsPaneWidth]);

  useLayoutEffect(() => {
    if (isCatalogLoading) {
      return;
    }

    if (!setsPaneManualRef.current) {
      const nextSetsWidth = estimateSetsPaneWidth(activeFamily, visibleFamilies);
      if (nextSetsWidth > setsPaneWidthRef.current) {
        setsPaneWidthRef.current = nextSetsWidth;
        setSetsPaneWidth(nextSetsWidth);
      }
    }

    if (!levelsPaneManualRef.current) {
      const nextLevelsWidth = estimateLevelsPaneWidth(activeEntry);
      if (nextLevelsWidth !== levelsPaneWidthRef.current) {
        levelsPaneWidthRef.current = nextLevelsWidth;
        setLevelsPaneWidth(nextLevelsWidth);
      }
    }
  }, [activeEntry, activeFamily, isCatalogLoading, visibleFamilies]);

  const expandSetsPane = useEffectEvent(() => {
    setIsSetsPaneCollapsed(false);
  });

  const expandLevelsPane = useEffectEvent(() => {
    setIsLevelsPaneCollapsed(false);
  });

  const collapseSetsPane = useEffectEvent(() => {
    setIsSetsPaneCollapsed(true);
  });

  const collapseLevelsPane = useEffectEvent(() => {
    setIsLevelsPaneCollapsed(true);
  });

  const toggleSetsPaneCollapsed = useEffectEvent(() => {
    setIsSetsPaneCollapsed((current) => !current);
  });

  const toggleLevelsPaneCollapsed = useEffectEvent(() => {
    setIsLevelsPaneCollapsed((current) => !current);
  });

  const startPaneResize = useEffectEvent((pane: ResizablePane, originX: number) => {
    const startWidth = pane === "sets" ? setsPaneWidthRef.current : levelsPaneWidthRef.current;
    const minWidth = pane === "sets" ? DASHBOARD_MIN_SETS_PANE_WIDTH : DASHBOARD_MIN_LEVELS_PANE_WIDTH;
    const maxWidth = pane === "sets" ? DASHBOARD_MAX_SETS_PANE_WIDTH : DASHBOARD_MAX_LEVELS_PANE_WIDTH;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = clamp(startWidth + (event.clientX - originX), minWidth, maxWidth);
      if (pane === "sets") {
        setsPaneManualRef.current = true;
        setIsSetsPaneCollapsed(false);
        setSetsPaneWidth(nextWidth);
        return;
      }

      levelsPaneManualRef.current = true;
      setIsLevelsPaneCollapsed(false);
      setLevelsPaneWidth(nextWidth);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  });

  return {
    collapseLevelsPane,
    collapseSetsPane,
    dashboardStyle: buildDashboardStyle(
      isSetsPaneCollapsed,
      setsPaneWidth,
      isLevelsPaneCollapsed,
      levelsPaneWidth,
    ),
    expandLevelsPane,
    expandSetsPane,
    isLevelsPaneCollapsed,
    isSetsPaneCollapsed,
    startPaneResize,
    toggleLevelsPaneCollapsed,
    toggleSetsPaneCollapsed,
  };
}
