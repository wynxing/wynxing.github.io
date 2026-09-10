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
  const greeting = document.querySelector("[data-greeting]");
  const hour = now.getHours();
  if (greeting)
    greeting.textContent = `${hour < 6 ? "夜深了，慢慢来" : hour < 12 ? "早上好，欢迎回来" : hour < 18 ? "下午好，欢迎回来" : "晚上好，放松一下"}。`;
};
document.addEventListener("astro:page-load", updateClock);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateClock();
});
setInterval(() => {
  if (!document.hidden) updateClock();
}, 30_000);
