import ReactMarkdown from "react-markdown";

// Renders a user's markdown note. Safe by construction: raw HTML in the text is dropped (skipHtml) and
// react-markdown's default urlTransform blanks javascript:/data: links. Works on the server and the client.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        skipHtml
        components={{
          // Links in notes open in a new tab and do not leak the page they came from.
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
