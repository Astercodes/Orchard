const editorialArt = document.querySelectorAll(".editorial-art");

if (editorialArt.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.25 });

  editorialArt.forEach((art) => observer.observe(art));
}
