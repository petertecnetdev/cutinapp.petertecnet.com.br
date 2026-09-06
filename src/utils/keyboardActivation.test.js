import { activateOnKeyboard } from "./keyboardActivation";

describe("activateOnKeyboard", () => {
  test.each(["Enter", " "])("activates with %p", (key) => {
    const preventDefault = jest.fn();
    const action = jest.fn();
    expect(activateOnKeyboard({ key, preventDefault }, action)).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  test("ignores unrelated keys", () => {
    const preventDefault = jest.fn();
    const action = jest.fn();
    expect(activateOnKeyboard({ key: "Tab", preventDefault }, action)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });
});
