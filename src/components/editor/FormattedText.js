import React, { useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { safeExternalHref } from "../../utils/safeUrl";
import "./FormattedText.css";

const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g;
const STYLE_PATTERN = /\{\{(color|size|font):([a-z-]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
const ALLOWED_STYLES = {
  color: new Set(["default", "wine", "red", "gold", "white", "gray"]),
  size: new Set(["sm", "md", "lg", "xl"]),
  font: new Set(["sans", "serif", "display"]),
};

const renderBasicInline = (value, keyPrefix = "inline") => String(value || "")
  .split(INLINE_PATTERN)
  .filter((part) => part !== "")
  .map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeExternalHref(link[2]);
      if (!href) return <span key={key}>{link[1]}</span>;
      return <a key={key} href={href} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    }

    return <React.Fragment key={key}>{part}</React.Fragment>;
  });

const renderInline = (value, keyPrefix = "inline") => {
  const source = String(value || "");
  const result = [];
  let cursor = 0;
  let match;
  STYLE_PATTERN.lastIndex = 0;
  while ((match = STYLE_PATTERN.exec(source)) !== null) {
    if (match.index > cursor) result.push(...renderBasicInline(source.slice(cursor, match.index), `${keyPrefix}-plain-${cursor}`));
    const [, type, option, content] = match;
    if (ALLOWED_STYLES[type]?.has(option)) {
      result.push(<span key={`${keyPrefix}-style-${match.index}`} className={`cut-text-${type}--${option}`}>{renderBasicInline(content, `${keyPrefix}-styled-${match.index}`)}</span>);
    } else {
      result.push(...renderBasicInline(content, `${keyPrefix}-unsafe-${match.index}`));
    }
    cursor = STYLE_PATTERN.lastIndex;
  }
  if (cursor < source.length) result.push(...renderBasicInline(source.slice(cursor), `${keyPrefix}-plain-${cursor}`));
  return result;
};

const extractAlignment = (line) => {
  const match = String(line || "").match(/^\{\{align:(left|center|right|justify)\}\}\s*/);
  return { alignment: match?.[1] || "", text: match ? line.slice(match[0].length) : line };
};

const paragraph = (lines, key) => {
  const first = extractAlignment(lines[0] || "");
  const normalizedLines = [first.text, ...lines.slice(1).map((line) => extractAlignment(line).text)];
  return (
  <p key={key} className={first.alignment ? `cut-text-align--${first.alignment}` : ""}>
    {normalizedLines.map((line, index) => (
      <React.Fragment key={`${key}-${index}`}>
        {index > 0 && <br />}
        {renderInline(line, `${key}-line-${index}`)}
      </React.Fragment>
    ))}
  </p>
  );
};

export function FormattedText({ value, className = "", emptyText = "" }) {
  const blocks = useMemo(() => {
    const source = String(value || "").replace(/\r\n?/g, "\n");
    if (!source.trim()) return emptyText ? [<p key="empty">{emptyText}</p>] : [];

    const lines = source.split("\n");
    const result = [];
    let paragraphLines = [];

    const flushParagraph = () => {
      if (!paragraphLines.length) return;
      result.push(paragraph(paragraphLines, `paragraph-${result.length}`));
      paragraphLines = [];
    };

    for (let index = 0; index < lines.length;) {
      const line = lines[index];

      if (!line.trim()) {
        flushParagraph();
        index += 1;
        continue;
      }

      if (/^---+$/.test(line.trim())) {
        flushParagraph();
        result.push(<hr key={`divider-${result.length}`} />);
        index += 1;
        continue;
      }

      const headingThree = line.match(/^###\s+(.+)$/);
      if (headingThree) {
        flushParagraph();
        result.push(<h4 key={`heading-3-${result.length}`}>{renderInline(headingThree[1], `heading-3-${result.length}`)}</h4>);
        index += 1;
        continue;
      }

      const headingTwo = line.match(/^##\s+(.+)$/);
      if (headingTwo) {
        flushParagraph();
        result.push(<h3 key={`heading-2-${result.length}`}>{renderInline(headingTwo[1], `heading-2-${result.length}`)}</h3>);
        index += 1;
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        flushParagraph();
        const items = [];
        while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^[-*]\s+/, ""));
          index += 1;
        }
        result.push(
          <ul key={`ul-${result.length}`}>
            {items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `ul-${result.length}-${itemIndex}`)}</li>)}
          </ul>
        );
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        flushParagraph();
        const items = [];
        while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\d+\.\s+/, ""));
          index += 1;
        }
        result.push(
          <ol key={`ol-${result.length}`}>
            {items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `ol-${result.length}-${itemIndex}`)}</li>)}
          </ol>
        );
        continue;
      }

      if (/^>\s?/.test(line)) {
        flushParagraph();
        const quoteLines = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) {
          quoteLines.push(lines[index].replace(/^>\s?/, ""));
          index += 1;
        }
        result.push(
          <blockquote key={`quote-${result.length}`}>
            {quoteLines.map((quoteLine, quoteIndex) => (
              <React.Fragment key={quoteIndex}>
                {quoteIndex > 0 && <br />}
                {renderInline(quoteLine, `quote-${result.length}-${quoteIndex}`)}
              </React.Fragment>
            ))}
          </blockquote>
        );
        continue;
      }

      paragraphLines.push(line);
      index += 1;
    }

    flushParagraph();
    return result;
  }, [value, emptyText]);

  return <div className={`cut-formatted-text ${className}`.trim()}>{blocks}</div>;
}

FormattedText.propTypes = {
  value: PropTypes.string,
  className: PropTypes.string,
  emptyText: PropTypes.string,
};

const TOOLBAR = [
  { key: "bold", label: "Negrito", icon: "fa-solid fa-bold" },
  { key: "italic", label: "Itálico", icon: "fa-solid fa-italic" },
  { key: "h2", label: "Título", icon: "fa-solid fa-heading" },
  { key: "h3", label: "Subtítulo", icon: "fa-solid fa-text-height" },
  { key: "bullet", label: "Lista", icon: "fa-solid fa-list-ul" },
  { key: "number", label: "Lista numerada", icon: "fa-solid fa-list-ol" },
  { key: "quote", label: "Destaque", icon: "fa-solid fa-quote-left" },
  { key: "link", label: "Link", icon: "fa-solid fa-link" },
  { key: "divider", label: "Separador", icon: "fa-solid fa-minus" },
  { key: "clear", label: "Limpar formatação", icon: "fa-solid fa-eraser" },
];

export function FormattedTextEditor({
  value,
  onChange,
  placeholder = "",
  maxLength = 10000,
  rows = 8,
  ariaLabel = "Editor de texto formatado",
  name = "description",
}) {
  const textareaRef = useRef(null);
  const [mode, setMode] = useState("write");
  const text = String(value || "");

  const commit = (nextValue, selectionStart, selectionEnd = selectionStart) => {
    const limited = maxLength ? nextValue.slice(0, maxLength) : nextValue;
    onChange(limited);
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const safeStart = Math.min(selectionStart, limited.length);
      const safeEnd = Math.min(selectionEnd, limited.length);
      textarea.setSelectionRange(safeStart, safeEnd);
    });
  };

  const selection = () => {
    const textarea = textareaRef.current;
    return {
      start: textarea?.selectionStart ?? text.length,
      end: textarea?.selectionEnd ?? text.length,
    };
  };

  const wrapSelection = (left, right = left, fallback = "texto") => {
    const { start, end } = selection();
    const selected = text.slice(start, end) || fallback;
    const replacement = `${left}${selected}${right}`;
    const next = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
    const innerStart = start + left.length;
    commit(next, innerStart, innerStart + selected.length);
  };

  const transformLines = (transform) => {
    const { start, end } = selection();
    const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const newlineAfter = text.indexOf("\n", end);
    const lineEnd = newlineAfter === -1 ? text.length : newlineAfter;
    const block = text.slice(lineStart, lineEnd);
    const transformed = transform(block.split("\n")).join("\n");
    const next = `${text.slice(0, lineStart)}${transformed}${text.slice(lineEnd)}`;
    commit(next, lineStart, lineStart + transformed.length);
  };

  const prefixLines = (prefix) => transformLines((lines) => {
    const nonEmpty = lines.filter((line) => line.trim());
    const allPrefixed = nonEmpty.length > 0 && nonEmpty.every((line) => line.startsWith(prefix));
    return lines.map((line) => {
      if (!line.trim()) return line;
      return allPrefixed ? line.slice(prefix.length) : `${prefix}${line.replace(/^(?:##?#?\s+|>\s+|[-*]\s+|\d+\.\s+)/, "")}`;
    });
  });

  const numberedLines = () => transformLines((lines) => {
    const nonEmpty = lines.filter((line) => line.trim());
    const allNumbered = nonEmpty.length > 0 && nonEmpty.every((line) => /^\d+\.\s+/.test(line));
    let number = 1;
    return lines.map((line) => {
      if (!line.trim()) return line;
      if (allNumbered) return line.replace(/^\d+\.\s+/, "");
      const clean = line.replace(/^(?:##?#?\s+|>\s+|[-*]\s+|\d+\.\s+)/, "");
      return `${number++}. ${clean}`;
    });
  });

  const insertLink = () => {
    const { start, end } = selection();
    const label = text.slice(start, end) || "texto do link";
    const replacement = `[${label}](https://)`;
    const next = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
    const urlStart = start + label.length + 3;
    commit(next, urlStart, urlStart + 8);
  };

  const insertDivider = () => {
    const { start, end } = selection();
    const before = text.slice(0, start);
    const after = text.slice(end);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n" : "";
    const insertion = `${prefix}---${suffix}`;
    commit(`${before}${insertion}${after}`, start + insertion.length);
  };

  const clearFormatting = () => transformLines((lines) => lines.map((line) => line
    .replace(/^\{\{align:(?:left|center|right|justify)\}\}\s*/, "")
    .replace(/\{\{(?:color|size|font):[a-z-]+\}\}([\s\S]*?)\{\{\/(?:color|size|font)\}\}/g, "$1")
    .replace(/^(?:###?\s+|>\s+|[-*]\s+|\d+\.\s+)/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")));

  const styleSelection = (type, option) => {
    if (!ALLOWED_STYLES[type]?.has(option) || option === "default" || option === "md" || option === "sans") return;
    wrapSelection(`{{${type}:${option}}}`, `{{/${type}}}`);
  };

  const alignLines = (alignment) => transformLines((lines) => lines.map((line) => {
    const clean = line.replace(/^\{\{align:(?:left|center|right|justify)\}\}\s*/, "");
    return alignment === "left" || !clean.trim() ? clean : `{{align:${alignment}}} ${clean}`;
  }));

  const applyTool = (tool) => {
    if (mode !== "write") setMode("write");
    if (tool === "bold") wrapSelection("**");
    else if (tool === "italic") wrapSelection("*");
    else if (tool === "h2") prefixLines("## ");
    else if (tool === "h3") prefixLines("### ");
    else if (tool === "bullet") prefixLines("- ");
    else if (tool === "number") numberedLines();
    else if (tool === "quote") prefixLines("> ");
    else if (tool === "link") insertLink();
    else if (tool === "divider") insertDivider();
    else if (tool === "clear") clearFormatting();
  };

  const handleKeyDown = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (!["b", "i", "k"].includes(key)) return;
    event.preventDefault();
    applyTool(key === "b" ? "bold" : key === "i" ? "italic" : "link");
  };

  return (
    <div className="cut-formatted-editor">
      <div className="cut-formatted-editor__topbar">
        <div className="cut-formatted-editor__toolbar" role="toolbar" aria-label="Formatação da descrição">
          {TOOLBAR.map((tool) => (
            <button
              key={tool.key}
              type="button"
              className="cut-formatted-editor__tool"
              onClick={() => applyTool(tool.key)}
              aria-label={tool.label}
              title={tool.label}
            >
              <i className={tool.icon} aria-hidden="true" />
            </button>
          ))}
          <select aria-label="Cor do texto" defaultValue="default" onChange={(event) => { styleSelection("color", event.target.value); event.target.value = "default"; }}>
            <option value="default">Cor</option><option value="wine">Vinho</option><option value="red">Vermelho</option><option value="gold">Dourado</option><option value="gray">Cinza</option><option value="white">Branco</option>
          </select>
          <select aria-label="Tamanho do texto" defaultValue="md" onChange={(event) => { styleSelection("size", event.target.value); event.target.value = "md"; }}>
            <option value="md">Tamanho</option><option value="sm">Pequeno</option><option value="lg">Grande</option><option value="xl">Destaque</option>
          </select>
          <select aria-label="Fonte do texto" defaultValue="sans" onChange={(event) => { styleSelection("font", event.target.value); event.target.value = "sans"; }}>
            <option value="sans">Fonte</option><option value="serif">Editorial</option><option value="display">Display</option>
          </select>
          <select aria-label="Alinhamento" defaultValue="left" onChange={(event) => alignLines(event.target.value)}>
            <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option><option value="justify">Justificar</option>
          </select>
        </div>
        <div className="cut-formatted-editor__modes" aria-label="Modo do editor">
          <button type="button" className={mode === "write" ? "is-active" : ""} onClick={() => setMode("write")}>Escrever</button>
          <button type="button" className={mode === "preview" ? "is-active" : ""} onClick={() => setMode("preview")}>Prévia</button>
        </div>
      </div>

      {mode === "write" ? (
        <textarea
          ref={textareaRef}
          name={name}
          data-ai-description="on"
          className="form-control cut-formatted-editor__input"
          value={text}
          onChange={(event) => onChange(maxLength ? event.target.value.slice(0, maxLength) : event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows}
          aria-label={ariaLabel}
        />
      ) : (
        <div className="cut-formatted-editor__preview" role="region" aria-label="Prévia da descrição formatada">
          <FormattedText value={text} emptyText="Sua descrição formatada aparecerá aqui." />
        </div>
      )}

      <div className="cut-formatted-editor__footer">
        <span><strong>Dica:</strong> destaque informações importantes e use listas para facilitar a leitura.</span>
        <span>{text.length.toLocaleString("pt-BR")}/{Number(maxLength || 0).toLocaleString("pt-BR")}</span>
      </div>
    </div>
  );
} 

FormattedTextEditor.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  maxLength: PropTypes.number,
  rows: PropTypes.number,
  ariaLabel: PropTypes.string,
  name: PropTypes.string,
};

export default FormattedTextEditor;
