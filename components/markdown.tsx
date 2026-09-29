"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-agent">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          a: (p) => <a {...p} target="_blank" rel="noreferrer" />,
          // A wrapper carries the border and scroll, so the table itself can fill the width.
          table: (p) => (
            <div className="table-wrap">
              <table {...p} />
            </div>
          ),
        }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
