"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";
import clsx from "clsx";

export function Composer(props: { busy: boolean; disabled: boolean; placeholder: string; text: string; setText: (t: string) => void; onSend: (text: string) => void; onStop: () => void }) {
  const { text, setText } = props;
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && text && document.activeElement !== el) {
      el.focus();
      // Select the first [placeholder] so the rep can type straight over it.
      const at = text.indexOf("[");
      if (at >= 0) el.setSelectionRange(at, text.indexOf("]", at) + 1);
    }
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const submit = () => {
    if (props.busy || props.disabled || !text.trim()) return;
    props.onSend(text.trim());
    setText("");
  };

  return (
    <div className={clsx("rounded-2xl border bg-card shadow-lift transition", props.disabled ? "border-line opacity-80" : "border-line-strong/70 focus-within:border-ink/25")}>
      <textarea
        ref={ref}
        value={text}
        rows={1}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className="block w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[15px] leading-relaxed text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed"
      />
      <div className="flex items-center justify-between px-3 pb-2.5">
        <span className="pl-1 text-[11.5px] text-faint">Enter to send · Shift+Enter for a new line</span>
        {props.busy ? (
          <button onClick={props.onStop} aria-label="Stop" className="grid size-8 place-items-center rounded-full bg-ink text-white transition hover:bg-ink-2">
            <Square className="size-3" fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!text.trim() || props.disabled}
            aria-label="Send"
            className="grid size-8 place-items-center rounded-full bg-ink text-white transition hover:bg-ink-2 disabled:bg-line-strong"
          >
            <ArrowUp className="size-4" strokeWidth={2.25} />
          </button>
        )}
      </div>
    </div>
  );
}
