import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, TextInput } from "./controls";

describe("Field accessibility semantics", () => {
  it("verknüpft ein einzelnes Control mit Label, Pflichtstatus und Meldungen", () => {
    const html = renderToStaticMarkup(
      createElement(
        Field,
        {
          label: "Projektname",
          required: true,
          hint: "Intern sichtbar",
          error: "Name fehlt",
          children: createElement(TextInput, { defaultValue: "" }),
        },
      ),
    );
    const labelFor = html.match(/<label for="([^"]+)"/)?.[1];
    const inputTag = html.match(/<input[^>]*>/)?.[0] ?? "";
    const controlId = inputTag.match(/\bid="([^"]+)"/)?.[1];

    expect(labelFor).toBeTruthy();
    expect(controlId).toBe(labelFor);
    expect(html).toContain("required=\"\"");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="');
    expect(html).toContain('aria-errormessage="');
    expect(html).toContain("Intern sichtbar");
    expect(html).toContain("Name fehlt");
  });

  it("bewahrt bereits gesetzte aria-describedby-IDs", () => {
    const html = renderToStaticMarkup(
      createElement(
        Field,
        {
          label: "Name",
          hint: "Hilfetext",
          children: createElement(TextInput, { "aria-describedby": "external-help" }),
        },
      ),
    );

    expect(html.match(/aria-describedby="([^"]+)"/)?.[1]).toContain("external-help");
    expect(html.match(/aria-describedby="([^"]+)"/)?.[1]).toContain("-hint");
  });

  it("rendert mehrere Controls als fieldset mit legend", () => {
    const html = renderToStaticMarkup(
      createElement(
        Field,
        {
          label: "Zeitraum",
          children: [
            createElement(TextInput, { key: "from", type: "date", "aria-label": "Von" }),
            createElement(TextInput, { key: "to", type: "date", "aria-label": "Bis" }),
          ],
        },
      ),
    );

    expect(html).toContain("<fieldset");
    expect(html).toContain('<legend class="field-label">Zeitraum</legend>');
    expect(html.match(/<input/g)).toHaveLength(2);
  });
});
