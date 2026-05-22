document.addEventListener("DOMContentLoaded", () => {
  const burger = document.querySelector("button.burger");
  const menu = document.getElementById("mobileMenu");

  if (burger && menu) {
    burger.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("open");
      burger.classList.toggle("is-open", isOpen);
      burger.setAttribute("aria-expanded", String(isOpen));
    });

    menu.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        menu.classList.remove("open");
        burger.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  const footer = document.querySelector(".premium-footer");
  if (footer) {
    footer.innerHTML = `
      <div class="premium-footer-inner">
        <div>
          <img class="footer-logo" src="/img/DJIGIT_logo_round_final-removebg.png" alt="DJIGIT US" />
          <p class="footer-copy">
            DJIGIT US LLC is an independent auto broker and dealership based in Los Angeles County. We help customers find, lease, finance, and buy vehicles with clear communication and paperwork support.
          </p>
        </div>

        <div>
          <div class="footer-heading">Quick Links</div>
          <div class="footer-links">
            <a href="/">Home</a>
            <a href="/application/">Credit Application</a>
            <a href="/contact/">Contact</a>
            <a href="https://www.instagram.com/djigit.us/" target="_blank" rel="noopener">Instagram</a>
          </div>
        </div>

        <div>
          <div class="footer-heading">Contact</div>
          <div class="footer-contact">
            <span>Los Angeles County, California</span>
            <a href="tel:+18185352313">(818) 535-2313</a>
            <a href="mailto:djigitusllc@gmail.com">djigitusllc@gmail.com</a>
            <a href="https://djigit.us">djigit.us</a>
            <a href="https://www.instagram.com/djigit.us/" target="_blank" rel="noopener">@djigit.us</a>
          </div>
        </div>
      </div>

      <div class="copyright">© 2026 DJIGIT US LLC. All rights reserved.</div>
    `;
  }
});
