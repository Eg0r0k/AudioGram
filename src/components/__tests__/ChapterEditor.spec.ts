import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { renderWithPlugins, screen } from "@/test/utils";
import ChapterEditor from "@/components/ChapterEditor.vue";

function createChapter(time: number, title: string) {
  return { id: crypto.randomUUID(), time, title };
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  textarea.value = value;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ChapterEditor", () => {
  it("renders textarea with chapter text", () => {
    renderWithPlugins(ChapterEditor, {
      props: {
        modelValue: [createChapter(65, "Intro"), createChapter(300, "Chapter 1")],
        duration: 500,
      },
    });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toContain("01:05 - Intro");
    expect(textarea.value).toContain("05:00 - Chapter 1");
  });

  it("shows chapter count", () => {
    renderWithPlugins(ChapterEditor, {
      props: {
        modelValue: [createChapter(0, "Start")],
        duration: 100,
      },
    });

    expect(screen.getByText("1 chapters")).toBeTruthy();
  });

  it("parses MM:SS - Title format", async () => {
    const { emitted } = renderWithPlugins(ChapterEditor, {
      props: {
        modelValue: [],
        duration: 500,
      },
    });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    setTextareaValue(textarea, "01:30 - Intro\n05:00 - Chapter 1");

    const updates = emitted("update:modelValue");
    expect(updates).toBeTruthy();
    const chapters = updates[0][0] as { time: number; title: string }[];
    expect(chapters).toHaveLength(2);
    expect(chapters[0].time).toBe(90);
    expect(chapters[0].title).toBe("Intro");
    expect(chapters[1].time).toBe(300);
    expect(chapters[1].title).toBe("Chapter 1");
  });

  it("parses MM:SS Title format without dash", async () => {
    const { emitted } = renderWithPlugins(ChapterEditor, {
      props: {
        modelValue: [],
        duration: 500,
      },
    });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    setTextareaValue(textarea, "01:30 Intro\n05:00 Chapter 1");

    const updates = emitted("update:modelValue");
    expect(updates).toBeTruthy();
    const chapters = updates[0][0] as { time: number; title: string }[];
    expect(chapters).toHaveLength(2);
    expect(chapters[0].time).toBe(90);
    expect(chapters[0].title).toBe("Intro");
    expect(chapters[1].time).toBe(300);
    expect(chapters[1].title).toBe("Chapter 1");
  });

  it("parses H:MM:SS - Title format with hours", async () => {
    const { emitted } = renderWithPlugins(ChapterEditor, {
      props: {
        modelValue: [],
        duration: 5000,
      },
    });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    setTextareaValue(textarea, "1:00:00 - Long chapter");

    const updates = emitted("update:modelValue");
    expect(updates).toBeTruthy();
    const chapters = updates[0][0] as { time: number; title: string }[];
    expect(chapters).toHaveLength(1);
    expect(chapters[0].time).toBe(3600);
    expect(chapters[0].title).toBe("Long chapter");
  });

  it("shows error for unparseable lines", async () => {
    renderWithPlugins(ChapterEditor, {
      props: {
        modelValue: [],
        duration: 500,
      },
    });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    setTextareaValue(textarea, "garbage text");
    await nextTick();

    expect(screen.getByText(/garbage text/)).toBeTruthy();
  });

  it("sorts chapters by time", async () => {
    const { emitted } = renderWithPlugins(ChapterEditor, {
      props: {
        modelValue: [],
        duration: 500,
      },
    });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    setTextareaValue(textarea, "05:00 - Later\n01:00 - Earlier");

    const updates = emitted("update:modelValue");
    expect(updates).toBeTruthy();
    const chapters = updates[0][0] as { time: number; title: string }[];
    expect(chapters[0].time).toBe(60);
    expect(chapters[1].time).toBe(300);
  });
});
