const updateClock = () => {
  const now = new Date();
  const clock = document.querySelector<HTMLTimeElement>("[data-desktop-clock]");
  if (clock) {
    clock.dateTime = now.toISOString();
    clock.textContent = new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  }
};
document.addEventListener("astro:page-load", updateClock);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateClock();
});
setInterval(() => {
  if (!document.hidden) updateClock();
}, 30_000);
