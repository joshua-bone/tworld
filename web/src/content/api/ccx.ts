import { XMLParser } from "fast-xml-parser";

export type Compatibility = "unknown" | "no" | "yes";
export type TextFormat = "plain" | "html";
export type HorizontalAlignment = "left" | "center" | "right";
export type VerticalAlignment = "top" | "middle" | "bottom";

export interface RulesetCompatibility {
  ms: Compatibility;
  lynx: Compatibility;
  pedantic: Compatibility;
}

export interface PageProperties {
  format: TextFormat;
  align: HorizontalAlignment;
  valign: VerticalAlignment;
  color: string;
  bgcolor: string;
}

export interface Page {
  text: string;
  pageProps: PageProperties;
}

export interface NarrativeText {
  pages: Page[];
}

export interface CcxLevel {
  number: number;
  author: string;
  rules: RulesetCompatibility;
  prologue: NarrativeText;
  epilogue: NarrativeText;
}

export interface CcxLevelset {
  description: string;
  copyright: string;
  author: string;
  rules: RulesetCompatibility;
  pageProps: PageProperties;
  styleSheet: string;
  levels: Map<number, CcxLevel>;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  cdataPropName: "text",
  trimValues: false,
});

function normalizeCompatibility(value?: string): Compatibility {
  if (value === "yes") return "yes";
  if (value === "no") return "no";
  return "unknown";
}

function normalizeTextFormat(value?: string): TextFormat {
  return value === "html" ? "html" : "plain";
}

function normalizeAlign(value?: string): HorizontalAlignment {
  if (value === "right") return "right";
  if (value === "center") return "center";
  return "left";
}

function normalizeVAlign(value?: string): VerticalAlignment {
  if (value === "bottom") return "bottom";
  if (value === "middle") return "middle";
  return "top";
}

function normalizeRulesetCompatibility(node: Record<string, unknown>): RulesetCompatibility {
  return {
    ms: normalizeCompatibility(typeof node.ms === "string" ? node.ms : undefined),
    lynx: normalizeCompatibility(typeof node.lynx === "string" ? node.lynx : undefined),
    pedantic: normalizeCompatibility(typeof node.pedantic === "string" ? node.pedantic : undefined),
  };
}

function normalizePageProperties(
  node: Record<string, unknown>,
  inherited?: PageProperties,
): PageProperties {
  return {
    format: normalizeTextFormat(typeof node.format === "string" ? node.format : inherited?.format),
    align: normalizeAlign(typeof node.align === "string" ? node.align : inherited?.align),
    valign: normalizeVAlign(typeof node.valign === "string" ? node.valign : inherited?.valign),
    color: typeof node.color === "string" ? node.color : inherited?.color ?? "#ffffff",
    bgcolor: typeof node.bgcolor === "string" ? node.bgcolor : inherited?.bgcolor ?? "#000000",
  };
}

function normalizeTextNode(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text;
  }
  return "";
}

function normalizePages(value: unknown, pageProps: PageProperties): NarrativeText {
  const container = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const pageValue = container.page;
  const pageNodes = Array.isArray(pageValue) ? pageValue : pageValue ? [pageValue] : [];

  return {
    pages: pageNodes.map((pageNode) => {
      const pageRecord = pageNode && typeof pageNode === "object" ? (pageNode as Record<string, unknown>) : {};
      return {
        text: normalizeTextNode(pageRecord),
        pageProps: normalizePageProperties(pageRecord, pageProps),
      };
    }),
  };
}

export function parseCcxLevelset(xml: string, levelCount: number): CcxLevelset {
  const parsed = xmlParser.parse(xml) as { levelset?: Record<string, unknown> };
  const levelsetNode = parsed.levelset ?? {};
  const baseRules = normalizeRulesetCompatibility(levelsetNode);
  const basePageProps = normalizePageProperties(levelsetNode);
  const levels = new Map<number, CcxLevel>();
  const levelNodes = Array.isArray(levelsetNode.level)
    ? levelsetNode.level
    : levelsetNode.level
      ? [levelsetNode.level]
      : [];

  for (let levelNumber = 1; levelNumber <= levelCount; levelNumber += 1) {
    levels.set(levelNumber, {
      number: levelNumber,
      author: typeof levelsetNode.author === "string" ? levelsetNode.author : "",
      rules: baseRules,
      prologue: { pages: [] },
      epilogue: { pages: [] },
    });
  }

  for (const levelNode of levelNodes) {
    const record = levelNode && typeof levelNode === "object" ? (levelNode as Record<string, unknown>) : {};
    const number = typeof record.number === "number" ? record.number : Number(record.number);
    if (!Number.isInteger(number) || number < 1 || number > levelCount) {
      continue;
    }

    levels.set(number, {
      number,
      author: typeof record.author === "string" ? record.author : typeof levelsetNode.author === "string" ? levelsetNode.author : "",
      rules: { ...baseRules, ...normalizeRulesetCompatibility(record) },
      prologue: normalizePages(record.prologue, basePageProps),
      epilogue: normalizePages(record.epilogue, basePageProps),
    });
  }

  return {
    description: typeof levelsetNode.description === "string" ? levelsetNode.description : "",
    copyright: typeof levelsetNode.copyright === "string" ? levelsetNode.copyright : "",
    author: typeof levelsetNode.author === "string" ? levelsetNode.author : "",
    rules: baseRules,
    pageProps: basePageProps,
    styleSheet:
      levelsetNode.style && typeof levelsetNode.style === "object" && "text" in levelsetNode.style
        ? normalizeTextNode(levelsetNode.style)
        : "",
    levels,
  };
}
