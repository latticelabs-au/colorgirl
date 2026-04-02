import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { KeyHint, RainbowText, Panel } from "../components/index.js";
import { useTerminalWidth } from "../hooks/index.js";
import { theme, LOGO, MASCOT } from "../theme.js";
import type { Client } from "@temporalio/client";
import { getStatusQuery } from "../../temporal/workflows/index.js";
import type { WorkflowStatus } from "../../temporal/workflows/index.js";

interface RecentWorkflow {
  id: string;
  url: string;
  startTime: Date;
  phase: string;
}

interface WelcomeScreenProps {
  version: string;
  isConnected: boolean;
  isClaudeConnected: boolean | null;
  client: Client | null;
  onContinue: () => void;
  onResume: (workflowId: string) => void;
}

function connectIcon(status: boolean | null): { icon: string; color: string } {
  if (status === null) return { icon: "◌", color: theme.textDim };
  return status
    ? { icon: "●", color: theme.success }
    : { icon: "○", color: theme.error };
}

const LOGO_COLORS = [
  theme.accentBright,
  theme.accent,
  theme.accent,
  theme.accentDim,
];

export function WelcomeScreen({
  version,
  isConnected,
  isClaudeConnected,
  client,
  onContinue,
  onResume,
}: WelcomeScreenProps): React.ReactElement {
  const [showWorkflows, setShowWorkflows] = useState(false);
  const [workflows, setWorkflows] = useState<RecentWorkflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Fetch running workflows when "r" is pressed
  useEffect(() => {
    if (!showWorkflows || !client) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const results: RecentWorkflow[] = [];
      try {
        const iter = client.workflow.list({
          query: 'WorkflowType = "scrapeWorkflow" AND ExecutionStatus = "Running"',
        });
        for await (const wf of iter) {
          if (cancelled) break;
          // Query each workflow for its status to get the phase
          let phase = "unknown";
          let url = "";
          try {
            const handle = client.workflow.getHandle(wf.workflowId);
            const status = await handle.query<WorkflowStatus>(getStatusQuery);
            phase = status.phase;
          } catch { /* workflow may have just completed */ }

          // Extract URL from workflow ID isn't possible, try to get it from search attributes
          // The URL is in the workflow input but we can't access that via list.
          // Use the workflow status message which often contains the site name.
          url = wf.workflowId;

          results.push({
            id: wf.workflowId,
            url,
            startTime: wf.startTime,
            phase,
          });
        }
      } catch { /* list may fail if Temporal doesn't support advanced visibility */ }

      if (!cancelled) {
        setWorkflows(results);
        setLoading(false);
        setSelectedIdx(0);
      }
    })();

    return () => { cancelled = true; };
  }, [showWorkflows, client]);

  useInput((input, key) => {
    if (showWorkflows) {
      if (key.escape) {
        setShowWorkflows(false);
        return;
      }
      if (workflows.length > 0) {
        if (key.upArrow || input === "k") {
          setSelectedIdx((i) => Math.max(0, i - 1));
          return;
        }
        if (key.downArrow || input === "j") {
          setSelectedIdx((i) => Math.min(workflows.length - 1, i + 1));
          return;
        }
        if (key.return) {
          const wf = workflows[selectedIdx];
          if (wf) onResume(wf.id);
          return;
        }
      }
      return;
    }

    if (key.return) onContinue();
    if (input === "r" && isConnected) setShowWorkflows(true);
  });

  const columns = useTerminalWidth();
  const wide = columns >= 60;
  const temporal = connectIcon(isConnected);
  const claude = connectIcon(isClaudeConnected);
  const logoLines = LOGO.split("\n").filter((l) => l.length > 0);

  // ── Workflow picker overlay ──
  if (showWorkflows) {
    return (
      <Box flexDirection="column" gap={1}>
        <RainbowText text="ColorGirl" bold />
        <Text bold color={theme.accent}>Resume a workflow</Text>

        {loading && <Text color={theme.textDim}>Loading workflows...</Text>}

        {!loading && workflows.length === 0 && (
          <Text color={theme.textDim}>No running workflows found.</Text>
        )}

        {!loading && workflows.length > 0 && (
          <Panel title={`${workflows.length} running workflow${workflows.length > 1 ? "s" : ""}`}>
            {workflows.map((wf, i) => {
              const focused = i === selectedIdx;
              const ts = wf.startTime.toLocaleString();
              return (
                <Box key={wf.id}>
                  <Text color={focused ? theme.accentBright : theme.textDim}>
                    {focused ? ">" : " "}{" "}
                  </Text>
                  <Text color={focused ? theme.text : theme.textDim} bold={focused}>
                    {wf.id}
                  </Text>
                  <Text color={theme.textDim}>  {wf.phase}  {ts}</Text>
                </Box>
              );
            })}
          </Panel>
        )}

        <KeyHint hints={[
          { key: "Enter", action: "Resume" },
          { key: "Esc", action: "Back" },
        ]} />
      </Box>
    );
  }

  // ── Normal welcome ──
  return (
    <Box flexDirection="column" gap={1}>
      {wide ? (
        <Box flexDirection="column">
          {logoLines.map((line, i) => (
            <Text key={i} color={LOGO_COLORS[i % LOGO_COLORS.length]}>
              {line}
            </Text>
          ))}
        </Box>
      ) : (
        <RainbowText text="ColorGirl" bold />
      )}

      <Box>
        <Text color={theme.accentLight}>v{version}</Text>
        <Text color={theme.textDim}> — AI-powered product scraper</Text>
      </Box>

      <Box flexDirection={wide ? "row" : "column"} gap={wide ? 4 : 1}>
        {wide && (
          <Box flexDirection="column" flexShrink={0}>
            {MASCOT.map((line, i) => (
              <Text key={i} color={theme.accent}>{line}</Text>
            ))}
          </Box>
        )}

        <Box flexDirection="column">
          <Text color={theme.accentLight} bold>Services</Text>
          <Text>
            <Text color={temporal.color}>{temporal.icon} </Text>
            <Text color={theme.textDim}>Temporal  </Text>
            <Text color={temporal.color}>{isConnected ? "Connected" : "Disconnected"}</Text>
          </Text>
          <Text>
            <Text color={claude.color}>{claude.icon} </Text>
            <Text color={theme.textDim}>Claude    </Text>
            <Text color={claude.color}>
              {isClaudeConnected === null ? "Checking..." : isClaudeConnected ? "Connected" : "Disconnected"}
            </Text>
          </Text>
        </Box>
      </Box>

      {isClaudeConnected === false && (
        <Text color={theme.warning}>
          Run &apos;claude&apos; to re-auth, or pass ANTHROPIC_API_KEY
        </Text>
      )}

      <KeyHint hints={[
        { key: "Enter", action: "New scrape" },
        { key: "r", action: "Resume workflow" },
        { key: "q", action: "Quit" },
        { key: "?", action: "Help" },
      ]} />
    </Box>
  );
}
