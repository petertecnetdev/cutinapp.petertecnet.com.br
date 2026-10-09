import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { AuthContext } from "../../context/AuthContext";
import communityMeetupService from "../../services/CommunityMeetupService";
import CommunityAttendanceSection from "./CommunityAttendanceSection";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: "/event/encontro-qa", search: "" }),
}));
jest.mock("../../services/CommunityMeetupService", () => ({
  __esModule: true,
  default: {
    attendance: jest.fn(),
    publicAttendance: jest.fn(),
    manageAttendance: jest.fn(),
    setAttendance: jest.fn(),
    selfCheckin: jest.fn(),
    organizerCheckin: jest.fn(),
  },
}));

const event = {
  id: 42,
  slug: "encontro-qa",
  start_date: "2026-10-09T10:00:00Z",
  end_date: "2026-10-09T11:00:00Z",
};
const member = { id: 7, first_name: "QA" };
const summary = { counts: { going: 1, attended: 0, interested: 0 }, mine: { status: "going" } };

describe("community attendance check-in clock and auth gates", () => {
  let container;
  let root;
  let oldActFlag;
  let oldGeolocation;

  const mount = async (user = member, meetup = event) => {
    await act(async () => {
      root.render(
        <AuthContext.Provider value={{ user }}>
          <CommunityAttendanceSection event={meetup} />
        </AuthContext.Provider>
      );
    });
  };
  const checkinVisible = () => Boolean([...container.querySelectorAll("button")]
    .find((button) => button.textContent.includes("Estou no local")));

  beforeEach(() => {
    oldActFlag = global.IS_REACT_ACT_ENVIRONMENT;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-09T09:59:45Z"));
    jest.clearAllMocks();
    communityMeetupService.attendance.mockResolvedValue(summary);
    communityMeetupService.publicAttendance.mockResolvedValue({ counts: summary.counts });
    oldGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    if (oldGeolocation) Object.defineProperty(navigator, "geolocation", oldGeolocation);
    else delete navigator.geolocation;
    jest.useRealTimers();
    global.IS_REACT_ACT_ENVIRONMENT = oldActFlag;
  });

  test("opens at event start and closes after event end without reloading", async () => {
    await mount();
    expect(checkinVisible()).toBe(false);
    act(() => jest.advanceTimersByTime(15000));
    expect(checkinVisible()).toBe(true);
    act(() => {
      jest.setSystemTime(new Date("2026-10-09T11:00:00Z"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(checkinVisible()).toBe(true); // inclusive end
    act(() => {
      jest.setSystemTime(new Date("2026-10-09T11:00:00.001Z"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(checkinVisible()).toBe(false);
  });

  test("interprets explicit timezone offsets as the same instant", async () => {
    jest.setSystemTime(new Date("2026-10-09T12:59:59Z"));
    await mount(member, {
      ...event,
      start_date: "2026-10-09T10:00:00-03:00",
      end_date: "2026-10-09T11:00:00-03:00",
    });
    expect(checkinVisible()).toBe(false);
    act(() => {
      jest.setSystemTime(new Date("2026-10-09T13:00:00Z"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(checkinVisible()).toBe(true);
  });

  test("keeps a single clock interval and cleans up listeners on unmount", async () => {
    const setIntervalSpy = jest.spyOn(window, "setInterval");
    const clearIntervalSpy = jest.spyOn(window, "clearInterval");
    const removeWindowSpy = jest.spyOn(window, "removeEventListener");
    const removeDocumentSpy = jest.spyOn(document, "removeEventListener");
    await mount();
    await mount();
    const intervalId = setIntervalSpy.mock.results[0]?.value;
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    root = createRoot(container);
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
    expect(removeWindowSpy).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(removeDocumentSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
    removeWindowSpy.mockRestore();
    removeDocumentSpy.mockRestore();
  });

  test("denied geolocation displays manual confirmation guidance", async () => {
    jest.setSystemTime(new Date("2026-10-09T10:10:00Z"));
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: jest.fn((success, failure) => failure({ code: 1 })) },
    });
    await mount();
    const button = [...container.querySelectorAll("button")]
      .find((item) => item.textContent.includes("Estou no local"));
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("O organizador pode confirmar sua presença");
    expect(communityMeetupService.selfCheckin).not.toHaveBeenCalled();
  });

  test("guest RSVP redirects to login and does not mutate attendance", async () => {
    await mount(null);
    const button = [...container.querySelectorAll("button")]
      .find((item) => item.textContent.includes("Eu vou"));
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(mockNavigate).toHaveBeenCalledWith("/login", {
      state: { from: "/event/encontro-qa#participar" },
    });
    expect(communityMeetupService.setAttendance).not.toHaveBeenCalled();
  });
});
