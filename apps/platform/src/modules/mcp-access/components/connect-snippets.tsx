import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/code-block";

export const endpointUrl = () => `${window.location.origin}/api/mcp`;

const claudeCodeCommand = (url: string, token: string) =>
  `claude mcp add --transport http aven ${url} --header "Authorization: Bearer ${token}"`;

const jsonConfig = (url: string, token: string) =>
  JSON.stringify(
    { mcpServers: { aven: { url, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  );

function Snippet({ title, value }: { title: string; value: string }) {
  return (
    <CodeBlock size="sm">
      <CodeBlockHeader>
        <CodeBlockTitle>{title}</CodeBlockTitle>
        <CodeBlockActions className="ml-auto">
          <CodeBlockCopyButton value={value} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent wrap>{value}</CodeBlockContent>
    </CodeBlock>
  );
}

export function ConnectSnippets({ token }: { token: string }) {
  const url = endpointUrl();
  return (
    <div className="flex flex-col gap-3">
      <Snippet title="Endpoint" value={url} />
      <Snippet title="Claude Code" value={claudeCodeCommand(url, token)} />
      <Snippet title="Any MCP client (JSON)" value={jsonConfig(url, token)} />
    </div>
  );
}
