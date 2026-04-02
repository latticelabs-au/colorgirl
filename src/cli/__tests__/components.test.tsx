import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { theme, progressColor, LOGO } from "../theme.js";
import { Spinner } from "../components/Spinner.js";
import { ProgressBar } from "../components/ProgressBar.js";
import { Table } from "../components/Table.js";
import { StatusBar } from "../components/StatusBar.js";
import { Header } from "../components/Header.js";
import { Checkbox } from "../components/Checkbox.js";
import { KeyHint } from "../components/KeyHint.js";
import { Text } from "ink";
import { StepProgress } from "../components/StepProgress.js";
import { Divider } from "../components/Divider.js";
import { Panel } from "../components/Panel.js";

describe("theme", () => {
  it("has the correct accent colour", () => {
    expect(theme.accent).toBe("#a56571");
  });

  it("has all required keys", () => {
    expect(theme).toHaveProperty("accent");
    expect(theme).toHaveProperty("accentDim");
    expect(theme).toHaveProperty("text");
    expect(theme).toHaveProperty("textDim");
    expect(theme).toHaveProperty("success");
    expect(theme).toHaveProperty("warning");
    expect(theme).toHaveProperty("error");
    expect(theme).toHaveProperty("bg");
    expect(theme).toHaveProperty("border");
  });

  it("progressColor returns error for low values", () => {
    expect(progressColor(0)).toBe(theme.error);
    expect(progressColor(33)).toBe(theme.error);
  });

  it("progressColor returns warning for mid values", () => {
    expect(progressColor(34)).toBe(theme.warning);
    expect(progressColor(66)).toBe(theme.warning);
  });

  it("progressColor returns success for high values", () => {
    expect(progressColor(67)).toBe(theme.success);
    expect(progressColor(100)).toBe(theme.success);
  });

  it("LOGO is a non-empty string", () => {
    expect(typeof LOGO).toBe("string");
    expect(LOGO.length).toBeGreaterThan(0);
  });
});

describe("Spinner", () => {
  it("renders with label text", () => {
    const { lastFrame } = render(<Spinner label="Loading data" />);
    expect(lastFrame()).toContain("Loading data");
  });
});

describe("ProgressBar", () => {
  it("renders at 0%", () => {
    const { lastFrame } = render(<ProgressBar value={0} />);
    const frame = lastFrame()!;
    expect(frame).toContain("0%");
  });

  it("renders at 50%", () => {
    const { lastFrame } = render(<ProgressBar value={50} />);
    const frame = lastFrame()!;
    expect(frame).toContain("50%");
  });

  it("renders at 100%", () => {
    const { lastFrame } = render(<ProgressBar value={100} />);
    const frame = lastFrame()!;
    expect(frame).toContain("100%");
  });

  it("renders with a label", () => {
    const { lastFrame } = render(<ProgressBar value={75} label="Scraping" />);
    const frame = lastFrame()!;
    expect(frame).toContain("Scraping");
    expect(frame).toContain("75%");
  });

  it("clamps values above 100", () => {
    const { lastFrame } = render(<ProgressBar value={150} />);
    expect(lastFrame()).toContain("100%");
  });

  it("clamps values below 0", () => {
    const { lastFrame } = render(<ProgressBar value={-10} />);
    expect(lastFrame()).toContain("0%");
  });
});

describe("Table", () => {
  const columns = [
    { key: "name", header: "Name", width: 15 },
    { key: "count", header: "Count", width: 8, align: "right" as const },
  ];

  const data = [
    { name: "Trophies", count: 42 },
    { name: "Medals", count: 18 },
  ];

  it("renders header text", () => {
    const { lastFrame } = render(<Table columns={columns} data={data} />);
    const frame = lastFrame()!;
    expect(frame).toContain("Name");
    expect(frame).toContain("Count");
  });

  it("renders data rows", () => {
    const { lastFrame } = render(<Table columns={columns} data={data} />);
    const frame = lastFrame()!;
    expect(frame).toContain("Trophies");
    expect(frame).toContain("42");
    expect(frame).toContain("Medals");
    expect(frame).toContain("18");
  });

  it("limits rows with maxRows", () => {
    const { lastFrame } = render(<Table columns={columns} data={data} maxRows={1} />);
    const frame = lastFrame()!;
    expect(frame).toContain("Trophies");
    expect(frame).not.toContain("Medals");
  });

  it("does not truncate text that exactly matches column width", () => {
    // "Fifteen Letters" is exactly 15 chars, matching the column width of 15
    const exactData = [{ name: "Fifteen Letters", count: 1 }];
    const { lastFrame } = render(<Table columns={columns} data={exactData} />);
    const frame = lastFrame()!;
    expect(frame).toContain("Fifteen Letters");
    expect(frame).not.toContain("...");
  });

  it("truncates long content with ellipsis", () => {
    const longData = [{ name: "VeryLongProductName", count: 1 }];
    const { lastFrame } = render(<Table columns={columns} data={longData} />);
    const frame = lastFrame()!;
    expect(frame).toContain("...");
  });
});

describe("StatusBar", () => {
  it("shows phase text", () => {
    const { lastFrame } = render(<StatusBar phase="Scraping" />);
    expect(lastFrame()).toContain("Scraping");
  });

  it("shows message when provided", () => {
    const { lastFrame } = render(
      <StatusBar phase="Scraping" message="Page 3 of 10" />
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Scraping");
    expect(frame).toContain("Page 3 of 10");
  });

  it("shows connected indicator", () => {
    const { lastFrame } = render(
      <StatusBar phase="Idle" isConnected={true} />
    );
    expect(lastFrame()).toContain("●");
  });

  it("shows disconnected indicator", () => {
    const { lastFrame } = render(
      <StatusBar phase="Idle" isConnected={false} />
    );
    expect(lastFrame()).toContain("○");
  });
});

describe("Checkbox", () => {
  it("renders checked state", () => {
    const { lastFrame } = render(<Checkbox label="Option A" checked={true} />);
    const frame = lastFrame()!;
    expect(frame).toContain("✓");
    expect(frame).toContain("Option A");
  });

  it("renders unchecked state", () => {
    const { lastFrame } = render(<Checkbox label="Option B" checked={false} />);
    const frame = lastFrame()!;
    expect(frame).toContain("[ ]");
    expect(frame).toContain("Option B");
  });

  it("renders focused state", () => {
    const { lastFrame } = render(
      <Checkbox label="Focused" checked={false} focused={true} />
    );
    expect(lastFrame()).toContain("Focused");
  });
});

describe("KeyHint", () => {
  it("renders all provided hints", () => {
    const hints = [
      { key: "↑/↓", action: "Navigate" },
      { key: "Space", action: "Select" },
      { key: "q", action: "Quit" },
    ];
    const { lastFrame } = render(<KeyHint hints={hints} />);
    const frame = lastFrame()!;
    expect(frame).toContain("Navigate");
    expect(frame).toContain("Select");
    expect(frame).toContain("Quit");
    expect(frame).toContain("↑/↓");
    expect(frame).toContain("Space");
    expect(frame).toContain("q");
  });
});

describe("Header", () => {
  it("renders with version", () => {
    const { lastFrame } = render(<Header version="1.0.0" />);
    const frame = lastFrame()!;
    expect(frame).toContain("ColorGirl");
    expect(frame).toContain("v1.0.0");
  });

  it("renders without version", () => {
    const { lastFrame } = render(<Header />);
    const frame = lastFrame()!;
    expect(frame).toContain("ColorGirl");
    expect(frame).not.toContain("v");
  });

  it("renders the logo", () => {
    const { lastFrame } = render(<Header version="1.0.0" />);
    // The logo contains "ColorGirl" text in ASCII, just verify the frame has content
    expect(lastFrame()!.length).toBeGreaterThan(0);
  });
});

describe("StepProgress", () => {
  it("shows all step labels", () => {
    const { lastFrame } = render(<StepProgress currentPhase="analyzing" />);
    const frame = lastFrame()!;
    expect(frame).toContain("Analysis");
    expect(frame).toContain("Config");
    expect(frame).toContain("Scraping");
    expect(frame).toContain("Products");
    expect(frame).toContain("Enrichment");
    expect(frame).toContain("Preview");
    expect(frame).toContain("Export");
  });

  it("marks current phase with filled circle", () => {
    const { lastFrame } = render(<StepProgress currentPhase="scraping" />);
    expect(lastFrame()).toContain("●");
  });

  it("marks completed phases with checkmark", () => {
    const { lastFrame } = render(<StepProgress currentPhase="scraping" />);
    expect(lastFrame()).toContain("✓");
  });

  it("marks pending phases with empty circle", () => {
    const { lastFrame } = render(<StepProgress currentPhase="analyzing" />);
    expect(lastFrame()).toContain("○");
  });

  it("renders gracefully for error phase", () => {
    const { lastFrame } = render(<StepProgress currentPhase="error" />);
    // Error without a specific step just shows all as pending
    expect(lastFrame()).toBeTruthy();
  });
});

describe("Divider", () => {
  it("renders a line without label", () => {
    const { lastFrame } = render(<Divider />);
    expect(lastFrame()).toContain("─");
  });

  it("renders with a label", () => {
    const { lastFrame } = render(<Divider label="Section" />);
    expect(lastFrame()).toContain("Section");
    expect(lastFrame()).toContain("─");
  });
});

describe("Panel", () => {
  it("renders children", () => {
    const { lastFrame } = render(
      <Panel><Text>Hello Panel</Text></Panel>,
    );
    expect(lastFrame()).toContain("Hello Panel");
  });

  it("renders with a title", () => {
    const { lastFrame } = render(
      <Panel title="My Panel"><Text>Content</Text></Panel>,
    );
    expect(lastFrame()).toContain("My Panel");
    expect(lastFrame()).toContain("Content");
  });
});
