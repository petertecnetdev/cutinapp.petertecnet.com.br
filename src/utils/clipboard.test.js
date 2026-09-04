import { copyText } from "./clipboard";

describe("copyText", () => {
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });
    document.execCommand = originalExecCommand;
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  test("uses the modern Clipboard API when available", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await expect(copyText("pix-code")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("pix-code");
  });

  test("falls back to execCommand when Clipboard API fails", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    document.execCommand = jest.fn().mockReturnValue(true);

    await expect(copyText("pix-code")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  test("returns false for empty values", async () => {
    await expect(copyText("")).resolves.toBe(false);
  });

  test("reports failure when both clipboard strategies fail", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    document.execCommand = jest.fn().mockReturnValue(false);

    await expect(copyText("pix-code")).resolves.toBe(false);
  });
});
