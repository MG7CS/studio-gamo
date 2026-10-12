import fs from 'fs';
import path from 'path';

const images = {
  hero: 'photo-oct-12-2026-at-10-50-25-am-1',
  avatar: 'photo-oct-12-2026-at-10-50-26-am-2',
  vocalist: 'photo-oct-12-2026-at-10-50-27-am-3',
  bass: 'photo-oct-12-2026-at-10-50-28-am-4',
  drummer: 'photo-oct-12-2026-at-10-50-29-am-5',
  academyHero: 'photo-oct-12-2026-at-10-50-31-am-8',
  liveHero: 'photo-oct-12-2026-at-10-50-32-am-9',
  church: 'photo-oct-12-2026-at-10-50-33-am-10',
  worshipHero: 'photo-oct-12-2026-at-10-50-46-am-1',
  academySecondary: 'photo-oct-12-2026-at-10-50-46-am-2'
};

const hasSizes = {
  hero: [480, 768, 1200, 1600],
  avatar: [480, 768],
  vocalist: [480, 768],
  bass: [480, 768],
  drummer: [480, 768],
  academyHero: [480, 768, 1200],
  liveHero: [480, 768, 1200, 1600],
  church: [480, 768, 1200],
  worshipHero: [480, 768, 1200],
  academySecondary: [480, 768, 1200]
};

function makePicture(key, alt, className, sizes = '100vw', eager = false) {
  const base = images[key];
  const widths = hasSizes[key];
  
  const avifSrcset = widths.map(w => `/images/optimized/${base}-${w}w.avif ${w}w`).join(', ');
  const webpSrcset = widths.map(w => `/images/optimized/${base}-${w}w.webp ${w}w`).join(', ');
  const fallback = `/images/optimized/${base}-${widths[widths.length - 1]}w.webp`;
  
  const loadingStr = eager ? 'fetchpriority="high" loading="eager" decoding="sync"' : 'loading="lazy" decoding="async"';
  
  return `
<picture>
  <source type="image/avif" srcset="${avifSrcset}" sizes="${sizes}" />
  <source type="image/webp" srcset="${webpSrcset}" sizes="${sizes}" />
  <img src="${fallback}" alt="${alt}" class="${className}" ${loadingStr} />
</picture>
  `.trim();
}

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="30" viewBox="0 0 1200 220" role="img" aria-label="Gamo Studios logo"><title>Gamo Studios</title><g fill="currentColor" transform="translate(25 22) scale(1)"><rect x="0" y="54.0" width="22" height="68" rx="11"/><rect x="33" y="25.0" width="22" height="126" rx="11"/><rect x="66" y="0.0" width="22" height="176" rx="11"/><rect x="99" y="25.0" width="22" height="126" rx="11"/><rect x="132" y="54.0" width="22" height="68" rx="11"/></g><g fill="currentColor"><path d="M858 739H1356V140Q1245 59 1119.5 21.5Q994 -16 854 -16Q675 -16 530.0 39.5Q385 95 282.0 194.0Q179 293 123.0 429.0Q67 565 67 726Q67 889 120.5 1025.0Q174 1161 273.0 1259.0Q372 1357 512.5 1412.0Q653 1467 827 1467Q917 1467 995.0 1452.5Q1073 1438 1139.0 1412.5Q1205 1387 1260.0 1352.0Q1315 1317 1360 1275L1273 1141Q1253 1109 1221.0 1102.0Q1189 1095 1151 1118Q1115 1140 1080.5 1157.5Q1046 1175 1007.0 1188.0Q968 1201 922.0 1208.0Q876 1215 816 1215Q715 1215 633.0 1180.0Q551 1145 493.5 1081.0Q436 1017 405.0 927.0Q374 837 374 726Q374 606 408.0 511.5Q442 417 504.0 352.0Q566 287 652.5 253.0Q739 219 845 219Q917 219 973.5 233.5Q1030 248 1084 273V517H920Q891 517 874.5 532.5Q858 548 858 572Z" transform="translate(218.0000 147.0000) scale(0.0560000 -0.0560000)"/><path d="M918 551 761 995Q747 1030 731.5 1077.0Q716 1124 702 1179Q688 1123 672.5 1075.5Q657 1028 643 993L487 551ZM1422 0H1189Q1150 0 1125.5 18.5Q1101 37 1089 66L991 343H413L315 66Q305 41 280.0 20.5Q255 0 217 0H-18L549 1451H856Z" transform="translate(299.1440 147.0000) scale(0.0560000 -0.0560000)"/><path d="M1752 1451V0H1487V891Q1487 919 1488.5 951.0Q1490 983 1494 1016L1079 229Q1045 164 974 164H932Q897 164 870.0 180.5Q843 197 827 229L410 1019Q413 984 415.0 951.5Q417 919 417 891V0H152V1451H380Q399 1451 414.0 1450.0Q429 1449 440.5 1444.5Q452 1440 461.5 1430.5Q471 1421 480 1404L886 630Q905 595 921.5 558.0Q938 521 953 482Q968 522 984.5 560.0Q1001 598 1020 633L1423 1404Q1432 1421 1442.0 1430.5Q1452 1440 1463.5 1444.5Q1475 1449 1489.5 1450.0Q1504 1451 1524 1451Z" transform="translate(377.7680 147.0000) scale(0.0560000 -0.0560000)"/><path d="M1554 726Q1554 567 1500.5 431.0Q1447 295 1349.5 196.0Q1252 97 1115.0 40.5Q978 -16 811 -16Q644 -16 507.0 40.5Q370 97 272.0 196.0Q174 295 120.5 431.0Q67 567 67 726Q67 885 120.5 1020.5Q174 1156 272.0 1255.0Q370 1354 507.0 1410.5Q644 1467 811 1467Q978 1467 1115.0 1410.5Q1252 1354 1349.5 1254.5Q1447 1155 1500.5 1019.5Q1554 884 1554 726ZM1247 726Q1247 840 1217.0 930.5Q1187 1021 1130.5 1084.5Q1074 1148 993.5 1181.5Q913 1215 811 1215Q709 1215 628.0 1181.5Q547 1148 490.5 1084.5Q434 1021 404.0 930.5Q374 840 374 726Q374 611 404.0 520.5Q434 430 490.5 367.0Q547 304 628.0 270.5Q709 237 811 237Q913 237 993.5 270.5Q1074 304 1130.5 367.0Q1187 430 1217.0 520.5Q1247 611 1247 726Z" transform="translate(484.3360 147.0000) scale(0.0560000 -0.0560000)"/><path d="M896 1243Q887 1226 870 1226Q857 1226 836.5 1244.5Q816 1263 781.0 1285.5Q746 1308 693.5 1327.0Q641 1346 564 1346Q487 1346 428.5 1324.0Q370 1302 330.5 1264.0Q291 1226 270.5 1176.0Q250 1126 250 1071Q250 999 280.5 952.0Q311 905 361.0 872.0Q411 839 474.5 816.5Q538 794 605.0 772.0Q672 750 735.5 723.5Q799 697 849.0 657.0Q899 617 929.5 558.5Q960 500 960 413Q960 324 929.5 245.5Q899 167 841.0 109.0Q783 51 699.0 17.5Q615 -16 507 -16Q367 -16 266.0 33.5Q165 83 89 169L117 213Q129 228 145 228Q154 228 168.0 216.0Q182 204 202.0 186.5Q222 169 250.0 148.5Q278 128 315.0 110.5Q352 93 400.0 81.0Q448 69 509 69Q593 69 659.0 94.5Q725 120 770.5 164.0Q816 208 840.0 268.5Q864 329 864 398Q864 473 833.5 521.5Q803 570 753.0 602.5Q703 635 639.5 657.0Q576 679 509.0 700.0Q442 721 378.5 747.0Q315 773 265.0 813.5Q215 854 184.5 914.5Q154 975 154 1066Q154 1137 181.0 1203.0Q208 1269 260.0 1319.5Q312 1370 388.5 1400.5Q465 1431 563 1431Q673 1431 760.5 1396.0Q848 1361 920 1289Z" transform="translate(591.1680 147.0000) scale(0.0535000 -0.0535000)"/><path d="M1129 1328H632V0H529V1328H29V1415H1129Z" transform="translate(648.4130 147.0000) scale(0.0535000 -0.0535000)"/><path d="M727 73Q829 73 909.5 108.5Q990 144 1046.0 207.0Q1102 270 1131.5 355.5Q1161 441 1161 540V1415H1263V540Q1263 423 1226.0 321.5Q1189 220 1119.5 144.5Q1050 69 950.5 26.0Q851 -17 727 -17Q603 -17 503.5 26.0Q404 69 334.5 144.5Q265 220 228.0 321.5Q191 423 191 540V1415H294V541Q294 442 323.5 356.5Q353 271 408.5 208.0Q464 145 544.5 109.0Q625 73 727 73Z" transform="translate(710.3660 147.0000) scale(0.0535000 -0.0535000)"/><path d="M1401 708Q1401 544 1352.0 413.0Q1303 282 1214.0 190.0Q1125 98 1000.5 49.0Q876 0 726 0H209V1415H726Q876 1415 1000.5 1366.0Q1125 1317 1214.0 1225.0Q1303 1133 1352.0 1002.0Q1401 871 1401 708ZM1295 708Q1295 856 1254.0 972.0Q1213 1088 1138.0 1168.0Q1063 1248 958.0 1290.0Q853 1332 726 1332H312V83H726Q853 83 958.0 125.0Q1063 167 1138.0 247.0Q1213 327 1254.0 443.0Q1295 559 1295 708Z" transform="translate(788.1550 147.0000) scale(0.0535000 -0.0535000)"/><path d="M312 0H209V1415H312Z" transform="translate(869.4750 147.0000) scale(0.0535000 -0.0535000)"/><path d="M1466 708Q1466 544 1417.0 410.5Q1368 277 1279.0 182.5Q1190 88 1065.5 36.5Q941 -15 791 -15Q641 -15 517.0 36.5Q393 88 304.0 182.5Q215 277 166.0 410.5Q117 544 117 708Q117 871 166.0 1004.5Q215 1138 304.0 1232.5Q393 1327 517.0 1379.0Q641 1431 791 1431Q941 1431 1065.5 1379.5Q1190 1328 1279.0 1233.0Q1368 1138 1417.0 1004.5Q1466 871 1466 708ZM1360 708Q1360 856 1319.0 974.0Q1278 1092 1203.0 1174.0Q1128 1256 1023.0 1299.5Q918 1343 791 1343Q665 1343 560.0 1299.5Q455 1256 379.5 1174.0Q304 1092 262.5 974.0Q221 856 221 708Q221 559 262.5 441.5Q304 324 379.5 242.0Q455 160 560.0 117.0Q665 74 791 74Q918 74 1023.0 117.0Q1128 160 1203.0 242.0Q1278 324 1319.0 441.5Q1360 559 1360 708Z" transform="translate(897.3485 147.0000) scale(0.0535000 -0.0535000)"/><path d="M896 1243Q887 1226 870 1226Q857 1226 836.5 1244.5Q816 1263 781.0 1285.5Q746 1308 693.5 1327.0Q641 1346 564 1346Q487 1346 428.5 1324.0Q370 1302 330.5 1264.0Q291 1226 270.5 1176.0Q250 1126 250 1071Q250 999 280.5 952.0Q311 905 361.0 872.0Q411 839 474.5 816.5Q538 794 605.0 772.0Q672 750 735.5 723.5Q799 697 849.0 657.0Q899 617 929.5 558.5Q960 500 960 413Q960 324 929.5 245.5Q899 167 841.0 109.0Q783 51 699.0 17.5Q615 -16 507 -16Q367 -16 266.0 33.5Q165 83 89 169L117 213Q129 228 145 228Q154 228 168.0 216.0Q182 204 202.0 186.5Q222 169 250.0 148.5Q278 128 315.0 110.5Q352 93 400.0 81.0Q448 69 509 69Q593 69 659.0 94.5Q725 120 770.5 164.0Q816 208 840.0 268.5Q864 329 864 398Q864 473 833.5 521.5Q803 570 753.0 602.5Q703 635 639.5 657.0Q576 679 509.0 700.0Q442 721 378.5 747.0Q315 773 265.0 813.5Q215 854 184.5 914.5Q154 975 154 1066Q154 1137 181.0 1203.0Q208 1269 260.0 1319.5Q312 1370 388.5 1400.5Q465 1431 563 1431Q673 1431 760.5 1396.0Q848 1361 920 1289Z" transform="translate(982.0390 147.0000) scale(0.0535000 -0.0535000)"/></g></svg>`;

const indexAstroContent = `---
import Layout from '../layouts/Layout.astro';
---

<Layout>
	<!-- 1. Global Navigation -->
	<header class="absolute top-0 w-full z-50 flex items-center justify-between p-6 max-w-[1440px] left-1/2 -translate-x-1/2 text-white">
		<a href="/" class="flex items-center text-white">
			${logoSvg}
		</a>
		<nav class="hidden lg:flex gap-8 items-center font-medium">
			<a href="/worship" class="hover:text-white/70 transition-colors">Worship</a>
			<a href="/academy" class="hover:text-white/70 transition-colors">Academy</a>
			<a href="/live" class="hover:text-white/70 transition-colors">Live</a>
			<a href="/production" class="hover:text-white/70 transition-colors">Production</a>
		</nav>
		<div class="hidden md:flex items-center gap-4">
			<a href="/signin" class="font-medium hover:opacity-70 transition-opacity">Sign In</a>
			<a href="/get-started" class="bg-white text-[#1D2323] px-5 py-2.5 rounded-lg font-medium hover:bg-white/90 transition-colors">Get Started</a>
		</div>
		<button class="lg:hidden text-white">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
		</button>
	</header>

	<main class="bg-[#1D2323] overflow-hidden">
		<!-- 2. Hero — Keep Worship Going -->
		<section class="relative min-h-screen flex items-center pt-24 pb-12 overflow-hidden">
			<!-- Full Bleed Background Image with dark gradient fade to left -->
			<div class="absolute inset-0 z-0">
        ${makePicture('hero', 'Keyboardist playing worship', 'w-full h-full object-cover object-center', '100vw', true)}
				<div class="absolute inset-0 bg-gradient-to-r from-[#1D2323] via-[#1D2323]/80 to-transparent"></div>
			</div>
			
			<div class="relative z-10 w-full max-w-[1440px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
				<div class="max-w-xl space-y-8 text-white">
					<h1 class="text-6xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.05]">
						Keep Worship<br/>Going.
					</h1>
					<p class="text-xl md:text-2xl text-[#F4EDE3]/80 leading-relaxed font-medium">
						Reliable musicians for every service. A curated roster of professionals ready when you need them.
					</p>
					<div class="flex flex-col sm:flex-row items-center gap-4 pt-6">
						<a href="/worship/hire" class="bg-[#B65B35] text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-[#8F432A] transition-colors w-full sm:w-auto text-center">
							Hire a Musician
						</a>
						<a href="/worship/apply" class="bg-white/10 backdrop-blur-md text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-white/20 transition-colors border border-white/20 w-full sm:w-auto text-center">
							Join the Roster
						</a>
					</div>
				</div>

				<!-- Floating UI Glassmorphism Cards -->
				<div class="hidden lg:block relative h-[600px] w-full">
					<!-- Musician Card -->
					<div class="absolute top-10 right-20 bg-white/10 backdrop-blur-xl border border-white/20 p-5 rounded-2xl shadow-2xl flex items-center gap-4 w-72 transform rotate-[-2deg]">
            <div class="w-14 h-14 rounded-full overflow-hidden flex-shrink-0">
              ${makePicture('avatar', 'David K.', 'w-full h-full object-cover', '56px')}
            </div>
						<div>
							<div class="font-bold text-white text-lg flex items-center gap-2">David K. <svg class="w-4 h-4 text-[#26865B]" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg></div>
							<div class="text-white/70 text-sm">Keys • Vocals</div>
						</div>
					</div>

					<!-- Church Service Card -->
					<div class="absolute bottom-20 left-10 bg-white/10 backdrop-blur-xl border border-white/20 p-4 rounded-2xl shadow-2xl w-80 transform rotate-[3deg]">
            <div class="w-full h-32 rounded-lg overflow-hidden mb-4">
              ${makePicture('church', 'Church Service', 'w-full h-full object-cover', '300px')}
            </div>
						<div class="font-bold text-white">Sunday Morning Service</div>
						<div class="text-white/70 text-sm mb-3">Today at 9:00 AM</div>
            <div class="w-full bg-white/20 h-2 rounded-full overflow-hidden">
              <div class="bg-[#26865B] h-full w-[80%]"></div>
            </div>
            <div class="text-right text-xs text-white/50 mt-1">Status: Covered</div>
					</div>
				</div>
			</div>
      
      <!-- Curved bottom overlap to next section -->
      <div class="absolute bottom-0 left-0 w-full overflow-hidden leading-none z-10 translate-y-[1px]">
        <svg viewBox="0 0 1440 120" class="w-full h-[60px] md:h-[120px]" preserveAspectRatio="none">
          <path d="M0,120 C320,0 1120,0 1440,120 L1440,120 L0,120 Z" fill="#F4EDE3"></path>
        </svg>
      </div>
		</section>

		<!-- 3. Meet the Musicians -->
		<section class="py-32 px-6 w-full bg-[#F4EDE3] relative z-20">
      <div class="max-w-[1440px] mx-auto">
        <div class="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
          <div class="max-w-2xl">
            <h2 class="text-[#B65B35] font-semibold tracking-wider text-sm uppercase mb-3">The Roster</h2>
            <h3 class="text-4xl md:text-5xl font-bold text-[#1D2323] tracking-tight">Meet the Musicians.</h3>
          </div>
          <a href="/roster" class="text-[#1D2323] font-medium border-b border-[#1D2323] pb-1 hover:text-[#B65B35] hover:border-[#B65B35] transition-colors">View full roster</a>
        </div>

        <!-- Asymmetric Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[300px]">
          <!-- Large Card (Vocalist) -->
          <div class="md:col-span-2 md:row-span-2 relative rounded-3xl overflow-hidden group">
            ${makePicture('vocalist', 'Sarah M. singing', 'w-full h-full object-cover transition-transform duration-700 group-hover:scale-105', '(min-width: 768px) 66vw, 100vw')}
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
            <div class="absolute bottom-0 left-0 p-8 w-full">
              <div class="flex justify-between items-end">
                <div>
                  <h4 class="font-bold text-3xl text-white mb-2">Sarah M.</h4>
                  <p class="text-white/80 font-medium">Lead Vocals • Choir Director</p>
                </div>
                <button class="bg-white/20 backdrop-blur-md text-white px-6 py-2 rounded-full font-medium hover:bg-white/30 transition-colors">View Profile</button>
              </div>
            </div>
          </div>
          
          <!-- Small Card Top (Bass) -->
          <div class="relative rounded-3xl overflow-hidden group">
            ${makePicture('bass', 'Marcus W. on Bass', 'w-full h-full object-cover transition-transform duration-700 group-hover:scale-105', '(min-width: 768px) 33vw, 100vw')}
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
            <div class="absolute bottom-0 left-0 p-6 w-full">
              <h4 class="font-bold text-xl text-white mb-1">Marcus W.</h4>
              <p class="text-white/80 text-sm">Bass Guitar</p>
            </div>
          </div>

          <!-- Small Card Bottom (Drummer) -->
          <div class="relative rounded-3xl overflow-hidden group">
            ${makePicture('drummer', 'David K. on Drums', 'w-full h-full object-cover transition-transform duration-700 group-hover:scale-105', '(min-width: 768px) 33vw, 100vw')}
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
            <div class="absolute bottom-0 left-0 p-6 w-full">
              <h4 class="font-bold text-xl text-white mb-1">Elijah T.</h4>
              <p class="text-white/80 text-sm">Drums • Percussion</p>
            </div>
          </div>
        </div>
      </div>
		</section>

		<!-- 4. Your Sunday, Covered. -->
		<section class="py-32 w-full bg-white relative">
      <!-- Top Curve -->
      <div class="absolute top-0 left-0 w-full overflow-hidden leading-none z-10 -translate-y-full rotate-180">
        <svg viewBox="0 0 1440 120" class="w-full h-[60px] md:h-[120px]" preserveAspectRatio="none">
          <path d="M0,120 C320,0 1120,0 1440,120 L1440,120 L0,120 Z" fill="#ffffff"></path>
        </svg>
      </div>

			<div class="max-w-[1440px] mx-auto px-6">
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
					<div class="space-y-8 max-w-xl">
						<div>
							<h2 class="text-[#B65B35] font-semibold tracking-wider text-sm uppercase mb-3">Worship Coverage</h2>
							<h3 class="text-4xl md:text-5xl lg:text-6xl font-bold text-[#1D2323] tracking-tight leading-[1.1]">Your Sunday,<br/>Covered.</h3>
						</div>
						<p class="text-xl text-[#6B6B67] leading-relaxed">
							We provide a vetted local roster with paid standby understudies and a reliable dispatch workflow so you're never left without a team.
						</p>
						
						<div class="space-y-6 pt-4">
							<div class="flex gap-5">
								<div class="flex-shrink-0 w-12 h-12 rounded-full bg-[#F4EDE3] flex items-center justify-center text-[#B65B35] font-bold text-xl">1</div>
								<div>
									<h4 class="text-xl font-bold text-[#1D2323] mb-2">Book the primary</h4>
									<p class="text-[#6B6B67] text-lg">Select a verified professional for your specific service times.</p>
								</div>
							</div>
							<div class="flex gap-5">
								<div class="flex-shrink-0 w-12 h-12 rounded-full bg-[#F4EDE3] flex items-center justify-center text-[#B65B35] font-bold text-xl">2</div>
								<div>
									<h4 class="text-xl font-bold text-[#1D2323] mb-2">Standby assigned</h4>
									<p class="text-[#6B6B67] text-lg">We automatically designate a standby musician on call.</p>
								</div>
							</div>
							<div class="flex gap-5">
								<div class="flex-shrink-0 w-12 h-12 rounded-full bg-[#F4EDE3] flex items-center justify-center text-[#B65B35] font-bold text-xl">3</div>
								<div>
									<h4 class="text-xl font-bold text-[#1D2323] mb-2">Failover logic</h4>
									<p class="text-[#6B6B67] text-lg">If the primary is delayed or sick, the standby is dispatched instantly.</p>
								</div>
							</div>
						</div>
					</div>
					
					<!-- Right side image with overlapping UI -->
					<div class="relative rounded-3xl overflow-hidden h-[600px] shadow-2xl">
            ${makePicture('worshipHero', 'Worship Dashboard', 'absolute inset-0 w-full h-full object-cover object-left', '50vw')}
						
						<!-- Simulated Glass UI snippet -->
						<div class="absolute bottom-10 right-10 w-full max-w-sm bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white p-6">
							<div class="flex justify-between items-center mb-5 border-b border-[#DED6CC] pb-4">
								<h5 class="font-bold text-[#1D2323]">Sunday Service</h5>
								<span class="text-xs font-semibold text-[#26865B] bg-[#26865B]/10 px-3 py-1.5 rounded-full">Confirmed</span>
							</div>
							<div class="space-y-4">
								<div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                    ${makePicture('avatar', 'Sarah M', 'w-full h-full object-cover', '40px')}
                  </div>
									<div class="flex-1">
										<div class="text-sm font-bold text-[#1D2323]">Sarah M.</div>
										<div class="text-xs text-[#6B6B67]">Primary • Keys</div>
									</div>
									<div class="w-2.5 h-2.5 rounded-full bg-[#26865B] shadow-[0_0_8px_#26865B]"></div>
								</div>
								<div class="flex items-center gap-4 opacity-70">
									<div class="w-10 h-10 rounded-full bg-[#DED6CC] border border-white"></div>
									<div class="flex-1">
										<div class="text-sm font-bold text-[#1D2323]">David K.</div>
										<div class="text-xs text-[#6B6B67]">Standby • Keys</div>
									</div>
									<div class="w-2.5 h-2.5 rounded-full bg-[#D7AD86]"></div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- 5. Gamo Academy & 6. Gamo Live -->
		<section class="py-24 px-6 max-w-[1440px] mx-auto w-full">
			<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
				
				<!-- Gamo Academy -->
				<div class="rounded-3xl relative overflow-hidden group flex flex-col justify-end min-h-[600px] shadow-xl">
          <div class="absolute inset-0 z-0 transition-transform duration-700 group-hover:scale-105">
            ${makePicture('academyHero', 'Academy Instructor', 'w-full h-full object-cover', '(min-width: 768px) 50vw, 100vw')}
          </div>
					<div class="absolute inset-0 bg-gradient-to-t from-[#1D2323] via-[#1D2323]/50 to-transparent z-0"></div>
					
					<div class="relative z-10 p-10 md:p-14 w-full">
						<div class="inline-block bg-[#D7AD86] text-[#1D2323] font-bold text-xs uppercase tracking-wider px-4 py-1.5 rounded-full mb-6">
							Academy
						</div>
						<h3 class="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">Master your<br/>instrument.</h3>
						<p class="text-lg text-[#F4EDE3]/90 max-w-sm mb-8">
							Private lessons and clinics from working professionals to build the next generation.
						</p>
						<a href="/academy" class="inline-flex items-center justify-center gap-2 bg-white/20 backdrop-blur-md text-white px-8 py-4 rounded-xl font-semibold hover:bg-white/30 transition-colors border border-white/20 w-full sm:w-auto">
							Explore Academy
						</a>
					</div>
				</div>

				<!-- Gamo Live -->
				<div class="rounded-3xl relative overflow-hidden group flex flex-col justify-end min-h-[600px] shadow-xl">
          <div class="absolute inset-0 z-0 transition-transform duration-700 group-hover:scale-105">
            ${makePicture('liveHero', 'Live Concert', 'w-full h-full object-cover object-right', '(min-width: 768px) 50vw, 100vw')}
          </div>
					<div class="absolute inset-0 bg-gradient-to-t from-[#8F432A] via-[#8F432A]/60 to-transparent z-0"></div>
					
					<div class="relative z-10 p-10 md:p-14 w-full">
						<div class="inline-block bg-white text-[#B65B35] font-bold text-xs uppercase tracking-wider px-4 py-1.5 rounded-full mb-6">
							Live
						</div>
						<h3 class="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">Experience the<br/>energy.</h3>
						<p class="text-lg text-white/90 max-w-sm mb-8">
							Curated live worship events, nights of worship, and special artist showcases.
						</p>
						<a href="/live" class="inline-flex items-center justify-center gap-2 bg-white/20 backdrop-blur-md text-white px-8 py-4 rounded-xl font-semibold hover:bg-white/30 transition-colors border border-white/20 w-full sm:w-auto">
							View Upcoming Events
						</a>
					</div>
				</div>

			</div>
		</section>

		<!-- Final CTA -->
		<section class="py-32 px-6 w-full relative overflow-hidden mt-12 bg-[#1D2323]">
      <div class="absolute inset-0 z-0 opacity-40">
        ${makePicture('church', 'Church Exterior', 'w-full h-full object-cover', '100vw')}
        <div class="absolute inset-0 bg-gradient-to-t from-[#1D2323] via-[#1D2323]/80 to-[#1D2323]"></div>
      </div>
			<div class="max-w-4xl mx-auto text-center relative z-10">
        <h2 class="text-5xl md:text-6xl font-bold text-white mb-8 tracking-tight">Ready to bring consistency to your stage?</h2>
        <p class="text-xl text-[#F4EDE3]/80 mb-12 max-w-2xl mx-auto">Join the premier platform connecting churches with professional worship musicians.</p>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href="/worship/hire" class="bg-[#B65B35] text-white px-10 py-5 rounded-xl font-semibold text-lg hover:bg-[#8F432A] transition-colors w-full sm:w-auto">
            Hire a Musician
          </a>
          <a href="/contact" class="bg-white/10 backdrop-blur-md text-white px-10 py-5 rounded-xl font-semibold text-lg hover:bg-white/20 transition-colors border border-white/20 w-full sm:w-auto">
            Contact Sales
          </a>
        </div>
			</div>
		</section>
	</main>

	<!-- Footer remains the same structure -->
	<footer class="bg-[#181F20] text-[#F4EDE3] py-16 px-6 relative z-10 border-t border-white/10">
		<div class="max-w-[1440px] mx-auto">
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-16">
				<div class="lg:col-span-2 space-y-6">
					<a href="/" class="flex items-center text-white">
						${logoSvg}
					</a>
					<p class="text-[#DED6CC] max-w-sm">
						Worship continuity through trusted professionals. Keeping your service covered.
					</p>
				</div>
				
				<div>
					<h4 class="font-semibold text-white mb-4">Platform</h4>
					<ul class="space-y-3">
						<li><a href="/worship" class="text-[#DED6CC] hover:text-white transition-colors">Worship</a></li>
						<li><a href="/academy" class="text-[#DED6CC] hover:text-white transition-colors">Academy</a></li>
						<li><a href="/live" class="text-[#DED6CC] hover:text-white transition-colors">Live</a></li>
						<li><a href="/production" class="text-[#DED6CC] hover:text-white transition-colors">Production</a></li>
					</ul>
				</div>
				
				<div>
					<h4 class="font-semibold text-white mb-4">Company</h4>
					<ul class="space-y-3">
						<li><a href="/about" class="text-[#DED6CC] hover:text-white transition-colors">About Us</a></li>
						<li><a href="/careers" class="text-[#DED6CC] hover:text-white transition-colors">Careers</a></li>
						<li><a href="/contact" class="text-[#DED6CC] hover:text-white transition-colors">Contact</a></li>
					</ul>
				</div>
				
				<div>
					<h4 class="font-semibold text-white mb-4">Legal</h4>
					<ul class="space-y-3">
						<li><a href="/privacy" class="text-[#DED6CC] hover:text-white transition-colors">Privacy Policy</a></li>
						<li><a href="/terms" class="text-[#DED6CC] hover:text-white transition-colors">Terms of Service</a></li>
					</ul>
				</div>
			</div>
			
			<div class="pt-8 border-t border-[#2A3131] flex flex-col md:flex-row items-center justify-between gap-4">
				<p class="text-sm text-[#DED6CC]">© {new Date().getFullYear()} Gamo Studios. All rights reserved.</p>
				<div class="flex gap-4">
					<a href="#" class="w-10 h-10 rounded-full bg-[#2A3131] flex items-center justify-center text-[#DED6CC] hover:bg-[#B65B35] hover:text-white transition-colors">
						<span class="sr-only">Instagram</span>
						<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
					</a>
				</div>
			</div>
		</div>
	</footer>
</Layout>
`;

fs.writeFileSync(path.join(process.cwd(), 'apps/web/src/pages/index.astro'), indexAstroContent, 'utf-8');
console.log('Successfully wrote apps/web/src/pages/index.astro');
