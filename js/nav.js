document.addEventListener("DOMContentLoaded", () => {
  const sharedStyle = document.createElement("style");
  sharedStyle.textContent = `
    .site-header{
      position:sticky !important;
      top:0 !important;
      left:0 !important;
      right:0 !important;
      z-index:9999 !important;
      background:rgba(0,0,0,.94) !important;
      border-bottom:1px solid rgba(215,173,74,.22) !important;
      backdrop-filter:blur(14px) !important;
      -webkit-backdrop-filter:blur(14px) !important;
      box-shadow:0 10px 28px rgba(0,0,0,.28) !important;
    }

    #mobileMenu{
      z-index:9998 !important;
    }

    .premium-footer{
      background:#0b0b0a !important;
      color:#fff !important;
      border-top:1px solid rgba(215,173,74,.45) !important;
      padding:42px 16px 20px !important;
      scroll-snap-align:none !important;
    }

    .premium-footer-inner{
      width:100% !important;
      max-width:1120px !important;
      margin:0 auto !important;
      display:grid !important;
      grid-template-columns:1.35fr .9fr 1.2fr !important;
      gap:44px !important;
      align-items:start !important;
    }

    .footer-logo{
      width:108px !important;
      height:108px !important;
      object-fit:contain !important;
      display:block !important;
      margin:0 0 16px !important;
    }

    .footer-copy{
      max-width:420px !important;
      color:#d7d2c8 !important;
      line-height:1.6 !important;
      font-size:15px !important;
      margin:0 !important;
    }

    .footer-heading{
      color:#d7ad4a !important;
      font-weight:900 !important;
      text-transform:uppercase !important;
      letter-spacing:.08em !important;
      margin:0 0 16px !important;
      font-size:16px !important;
    }

    .footer-links,
    .footer-contact{
      display:grid !important;
      gap:10px !important;
      color:#d7d2c8 !important;
      font-size:15px !important;
      line-height:1.35 !important;
    }

    .footer-links a,
    .footer-contact a{
      color:#d7d2c8 !important;
      text-decoration:none !important;
    }

    .footer-links a:hover,
    .footer-contact a:hover{
      color:#f1d893 !important;
    }

    .copyright{
      width:100% !important;
      max-width:1120px !important;
      margin:30px auto 0 !important;
      padding-top:18px !important;
      border-top:1px solid rgba(215,173,74,.22) !important;
      text-align:center !important;
      color:#c4bcac !important;
      font-size:13px !important;
    }

    @media(max-width:860px){
      .premium-footer-inner{
        grid-template-columns:1fr !important;
        gap:28px !important;
      }
    }
  `;
  document.head.appendChild(sharedStyle);

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
