import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group";

import { useUsage } from "../hooks/use-usage";
import { UsageChart } from "./usage-chart";

type Range = "7" | "30";

export function UsagePanel() {
  const [range, setRange] = useState<Range>("30");
  const { points, tokens, cost, averageTokens } = useUsage(Number(range));

  return (
    <>
      <PageHeader
        title="Usage"
        description="Tokens and spend across the workspace."
        actions={
          <ToggleGroup
            aria-label="Range"
            value={[range]}
            onValueChange={(next) => next[0] && setRange(next[0] as Range)}
            size="sm"
            spacing={1}
          >
            <ToggleGroupItem value="7">7 days</ToggleGroupItem>
            <ToggleGroupItem value="30">30 days</ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <section aria-label="Totals" className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tokens (thousands)" value={Math.round(tokens / 1000)} />
        <StatCard label="Estimated cost (USD)" value={Math.round(cost)} />
        <StatCard label="Avg. daily tokens (thousands)" value={Math.round(averageTokens / 1000)} />
      </section>

      <UsageChart points={points} />

      <Table aria-label="Usage by mode">
        <TableHeader>
          <TableRow>
            <TableHead>Mode</TableHead>
            <TableHead className="text-right">Tokens</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Smart</TableCell>
            <TableCell className="text-right">
              {Math.round(tokens * 0.7).toLocaleString()}
            </TableCell>
            <TableCell className="text-right">${(cost * 0.8).toFixed(2)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Rush</TableCell>
            <TableCell className="text-right">
              {Math.round(tokens * 0.3).toLocaleString()}
            </TableCell>
            <TableCell className="text-right">${(cost * 0.2).toFixed(2)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </>
  );
}
