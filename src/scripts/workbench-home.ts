import { onPage } from "./lifecycle";

interface SeedItem {
  title: string;
  href: string;
  meta: string;
  excerpt: string;
}

interface PagefindHit {
  url: string;
  excerpt?: string;
  meta?: { title?: string };
}

interface PagefindApi {
  init?: () => Promise<void>;
  search: (query: string) => Promise<{
    results: Array<{ data: () => Promise<PagefindHit> }>;
  }>;
}

onPage((signal) => {
  const root = document.querySelector<HTMLElement>("[data-workbench-home]");
  if (!root) return;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // 1. Acrylic black-cat pin subtle studio tilt
  const pin = root.querySelector<HTMLElement>("[data-cat-pin]");
  if (pin && !reducedMotion.matches) {
    pin.addEventListener(
      "pointermove",
      (event) => {
        const rect = pin.getBoundingClientRect();
        const nx = (event.clientX - rect.left) / rect.width - 0.5;
        const ny = (event.clientY - rect.top) / rect.height - 0.5;
        pin.style.setProperty("--pin-rx", `${(-ny * 10).toFixed(2)}deg`);
        pin.style.setProperty("--pin-ry", `${(nx * 12).toFixed(2)}deg`);
        pin.style.setProperty("--sheen-x", `${((nx + 0.5) * 100).toFixed(1)}%`);
      },
      { signal },
    );
    pin.addEventListener(
      "pointerleave",
      () => {
        pin.style.removeProperty("--pin-rx");
        pin.style.removeProperty("--pin-ry");
        pin.style.removeProperty("--sheen-x");
      },
      { signal },
    );
  }

  // 2. Mechanical Search Launcher (Pagefind live results + local seed fallback)
  const form = root.querySelector<HTMLFormElement>("[data-wb-search-form]");
  const input = root.querySelector<HTMLInputElement>("[data-wb-search-input]");
  const resultsBox = root.querySelector<HTMLElement>("[data-wb-search-results]");
  const modKeycap = root.querySelector<HTMLElement>('[data-keycap="mod"]');
  const kKeycap = root.querySelector<HTMLElement>('[data-keycap="k"]');
  const enterKeycap = root.querySelector<HTMLElement>('[data-keycap="enter"]');

  if (!form || !input || !resultsBox) return;

  if (
    modKeycap &&
    typeof navigator !== "undefined" &&
    !/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
  ) {
    modKeycap.textContent = "Ctrl";
  }

  const seed: SeedItem[] = (() => {
    try {
      return JSON.parse(form.dataset.searchSeed || "[]");
    } catch {
      return [];
    }
  })();

  let pagefindPromise: Promise<PagefindApi | null> | null = null;
  let searchSeq = 0;
  let activeIndex = -1;

  const flashKeycap = (el: HTMLElement | null) => {
    if (!el || reducedMotion.matches) return;
    el.classList.add("is-pressed");
    setTimeout(() => el.classList.remove("is-pressed"), 160);
  };

  const loadPagefind = (): Promise<PagefindApi | null> => {
    if (!pagefindPromise) {
      const url = "/pagefind/pagefind.js";
      pagefindPromise = import(/* @vite-ignore */ url)
        .then(async (mod: PagefindApi) => {
          if (typeof mod.init === "function") await mod.init();
          return mod;
        })
        .catch(() => null);
    }
    return pagefindPromise;
  };

  const closeResults = () => {
    resultsBox.hidden = true;
    resultsBox.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
  };

  const renderResults = (
    items: Array<{ title: string; href: string; sub: string; isHtml?: boolean }>,
    query: string,
  ) => {
    resultsBox.innerHTML = "";
    activeIndex = -1;

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "wb-search-empty";
      const msg = document.createElement("span");
      msg.textContent = `没有找到 “${query}” 的匹配项`;
      const go = document.createElement("a");
      go.href = `/search/?q=${encodeURIComponent(query)}`;
      go.textContent = "前往全站搜索 ↗";
      empty.append(msg, go);
      resultsBox.append(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "wb-search-list";
      items.forEach((item) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.className = "wb-search-item";
        a.href = item.href;
        const title = document.createElement("strong");
        title.textContent = item.title;
        const sub = document.createElement("span");
        if (item.isHtml) {
          sub.innerHTML = item.sub;
        } else {
          sub.textContent = item.sub;
        }
        a.append(title, sub);
        li.append(a);
        list.append(li);
      });
      const footer = document.createElement("a");
      footer.className = "wb-search-all";
      footer.href = `/search/?q=${encodeURIComponent(query)}`;
      footer.textContent = `查看全部搜索结果 ↵`;
      resultsBox.append(list, footer);
    }

    resultsBox.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  const runSearch = async (raw: string) => {
    const query = raw.trim();
    const seq = ++searchSeq;
    if (!query) {
      closeResults();
      return;
    }

    const pf = await loadPagefind();
    if (signal.aborted || seq !== searchSeq) return;

    if (pf) {
      try {
        const res = await pf.search(query);
        const top = await Promise.all(res.results.slice(0, 6).map((r) => r.data()));
        if (signal.aborted || seq !== searchSeq) return;
        renderResults(
          top.map((hit) => ({
            title: hit.meta?.title || hit.url,
            href: hit.url,
            sub: hit.excerpt || hit.url,
            isHtml: Boolean(hit.excerpt),
          })),
          query,
        );
        return;
      } catch {
        // Fall through to seed fallback
      }
    }

    const lower = query.toLowerCase();
    const matched = seed
      .filter(
        (item) =>
          item.title.toLowerCase().includes(lower) ||
          item.excerpt.toLowerCase().includes(lower) ||
          item.meta.toLowerCase().includes(lower),
      )
      .slice(0, 6);
    renderResults(
      matched.map((item) => ({
        title: item.title,
        href: item.href,
        sub: item.meta,
      })),
      query,
    );
  };

  let timer = 0;
  input.addEventListener(
    "focus",
    () => {
      void loadPagefind();
      if (input.value.trim()) void runSearch(input.value);
    },
    { signal },
  );

  input.addEventListener(
    "input",
    () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void runSearch(input.value), 120);
    },
    { signal },
  );

  input.addEventListener(
    "keydown",
    (event) => {
      const links = [...resultsBox.querySelectorAll<HTMLAnchorElement>("a")];
      if (event.key === "Escape") {
        closeResults();
        input.blur();
        return;
      }
      if (event.key === "ArrowDown" && links.length > 0) {
        event.preventDefault();
        activeIndex = (activeIndex + 1) % links.length;
        links.forEach((l, i) => l.classList.toggle("is-selected", i === activeIndex));
        return;
      }
      if (event.key === "ArrowUp" && links.length > 0) {
        event.preventDefault();
        activeIndex = (activeIndex - 1 + links.length) % links.length;
        links.forEach((l, i) => l.classList.toggle("is-selected", i === activeIndex));
        return;
      }
      if (event.key === "Enter") {
        flashKeycap(enterKeycap);
        if (activeIndex >= 0 && links[activeIndex]) {
          event.preventDefault();
          links[activeIndex].click();
        }
      }
    },
    { signal },
  );

  form.addEventListener(
    "submit",
    () => {
      flashKeycap(enterKeycap);
    },
    { signal },
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target as Node | null;
      if (target && !form.contains(target)) {
        closeResults();
      }
    },
    { signal },
  );

  window.addEventListener(
    "keydown",
    (event) => {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const active = document.activeElement;
      const typing =
        active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
      const isSlash = !event.metaKey && !event.ctrlKey && !event.altKey && event.key === "/" && !typing;
      if (!isCmdK && !isSlash) return;
      event.preventDefault();
      flashKeycap(modKeycap);
      flashKeycap(kKeycap);
      input.focus();
      input.select();
    },
    { signal },
  );
});
