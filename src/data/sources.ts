/**
 * Every source the atlas relies on. Papers are cited without links (titles are enough to
 * find them); data products link to the page they were downloaded from.
 */
export interface Source {
  id: string;
  cite: string;
  url?: string;
  /** what it is used for — i18n key */
  use: string;
  /** licence / usage note shown verbatim */
  note?: string;
}

export const SOURCES: Source[] = [
  // --- dynamics ---
  { id: 'horizons', cite: 'NASA/JPL Horizons System — state vectors, DE441 ephemeris', url: 'https://ssd.jpl.nasa.gov/horizons/', use: 'use.states' },
  { id: 'de440', cite: 'Park, R. S. et al. (2021). The JPL Planetary and Lunar Ephemerides DE440 and DE441. AJ 161, 105', use: 'use.gm' },
  { id: 'yoshida1990', cite: 'Yoshida, H. (1990). Construction of higher order symplectic integrators. Phys. Lett. A 150, 262', use: 'use.integrator' },
  { id: 'benitez2008', cite: 'Benitez, F. & Gallardo, T. (2008). The relativistic factor in the orbital dynamics of point masses. Celest. Mech. Dyn. Astr. 101, 289', use: 'use.relativity' },
  { id: 'iau2015', cite: 'Archinal, B. A. et al. (2018). Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015. Celest. Mech. Dyn. Astr. 130, 22', use: 'use.rotation' },
  { id: 'nssdc', cite: 'Williams, D. R. — NASA Planetary Fact Sheets, NSSDCA', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/', use: 'use.facts' },
  { id: 'sbdb', cite: 'NASA/JPL Small-Body Database Query API — osculating elements', url: 'https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html', use: 'use.smallbodies' },
  { id: 'brozovic2015', cite: 'Brozović, M. et al. (2015). The orbits and masses of satellites of Pluto. Icarus 246, 317', use: 'use.charon' },
  // --- stars and galaxy ---
  { id: 'bsc5', cite: 'Hoffleit, D. & Warren, W. H. (1991). The Bright Star Catalogue, 5th rev. ed., via VizieR V/50 (CDS)', url: 'https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50', use: 'use.sky' },
  { id: 'simbad', cite: 'Wenger, M. et al. (2000). The SIMBAD astronomical database. A&AS 143, 9 — TAP service, CDS Strasbourg', url: 'https://simbad.cds.unistra.fr/simbad/', use: 'use.nearby', note: 'This research has made use of the SIMBAD database, operated at CDS, Strasbourg, France.' },
  { id: 'bhg2016', cite: 'Bland-Hawthorn, J. & Gerhard, O. (2016). The Galaxy in Context. ARA&A 54, 529', use: 'use.galaxy' },
  { id: 'bennett2019', cite: 'Bennett, M. & Bovy, J. (2019). Vertical waves in the solar neighbourhood in Gaia DR2. MNRAS 482, 1417', use: 'use.galaxy' },
  { id: 'vallee2017', cite: 'Vallée, J. P. (2017). A guided map to the spiral arms in the galactic disk of the Milky Way. Astrophys. Space Sci. 362, 79', use: 'use.galaxy' },
  { id: 'stone2013', cite: 'Stone, E. C. et al. (2013). Voyager 1 observes low-energy galactic cosmic rays in a region depleted of heliospheric ions. Science 341, 150', use: 'use.heliosphere' },
  { id: 'stone2019', cite: 'Stone, E. C. et al. (2019). Cosmic ray measurements from Voyager 2 as it crossed into interstellar space. Nat. Astron. 3, 1013', use: 'use.heliosphere' },
  // --- interiors ---
  { id: 'prem', cite: 'Dziewonski, A. M. & Anderson, D. L. (1981). Preliminary reference Earth model. Phys. Earth Planet. Inter. 25, 297', use: 'use.interior' },
  { id: 'weber2011', cite: 'Weber, R. C. et al. (2011). Seismic detection of the lunar core. Science 331, 309', use: 'use.interior' },
  { id: 'wieczorek2013', cite: 'Wieczorek, M. A. et al. (2013). The crust of the Moon as seen by GRAIL. Science 339, 671', use: 'use.interior' },
  { id: 'stahler2021', cite: 'Stähler, S. C. et al. (2021). Seismic detection of the martian core. Science 373, 443', use: 'use.interior' },
  { id: 'samuel2023', cite: 'Samuel, H. et al. (2023). Geophysical evidence for an enriched molten silicate layer above Mars’s core. Nature 622, 712', use: 'use.interior' },
  { id: 'khan2023', cite: 'Khan, A. et al. (2023). Evidence for a liquid silicate layer atop the Martian core. Nature 622, 718', use: 'use.interior' },
  { id: 'knapmeyer2021', cite: 'Knapmeyer-Endrun, B. et al. (2021). Thickness and structure of the martian crust from InSight seismic data. Science 373, 438', use: 'use.interior' },
  { id: 'hauck2013', cite: 'Hauck, S. A. et al. (2013). The curious case of Mercury’s internal structure. JGR Planets 118, 1204', use: 'use.interior' },
  { id: 'genova2019', cite: 'Genova, A. et al. (2019). Geodetic evidence that Mercury has a solid inner core. GRL 46, 3625', use: 'use.interior' },
  { id: 'padovan2015', cite: 'Padovan, S. et al. (2015). Thickness of the crust of Mercury from geoid-to-topography ratios. GRL 42, 1029', use: 'use.interior' },
  { id: 'wahl2017', cite: 'Wahl, S. M. et al. (2017). Comparing Jupiter interior structure models to Juno gravity measurements and the role of a dilute core. GRL 44, 4649', use: 'use.interior' },
  { id: 'militzer2022', cite: 'Militzer, B. et al. (2022). Juno spacecraft measurements of Jupiter’s gravity imply a dilute core. Planet. Sci. J. 3, 185', use: 'use.interior' },
  { id: 'mankovich2021', cite: 'Mankovich, C. R. & Fuller, J. (2021). A diffuse core in Saturn revealed by ring seismology. Nat. Astron. 5, 1103', use: 'use.interior' },
  { id: 'helled2011', cite: 'Helled, R. et al. (2011). Interior models of Uranus and Neptune. ApJ 726, 15', use: 'use.interior' },
  { id: 'nimmo2016', cite: 'Nimmo, F. et al. (2016). Reorientation of Sputnik Planitia implies a subsurface ocean on Pluto. Nature 540, 94', use: 'use.interior' },
  { id: 'anderson1998', cite: 'Anderson, J. D. et al. (1998). Europa’s differentiated internal structure: inferences from four Galileo encounters. Science 281, 2019', use: 'use.interior' },
  { id: 'kivelson2000', cite: 'Kivelson, M. G. et al. (2000). Galileo magnetometer measurements: a stronger case for a subsurface ocean at Europa. Science 289, 1340', use: 'use.interior' },
  { id: 'iess2014', cite: 'Iess, L. et al. (2014). The gravity field and interior structure of Enceladus. Science 344, 78', use: 'use.interior' },
  { id: 'thomas2016', cite: 'Thomas, P. C. et al. (2016). Enceladus’s measured physical libration requires a global subsurface ocean. Icarus 264, 37', use: 'use.interior' },
  { id: 'cd1991', cite: 'Christensen-Dalsgaard, J., Gough, D. O. & Thompson, M. J. (1991). The depth of the solar convection zone. ApJ 378, 413', use: 'use.interior' },
  { id: 'bahcall2005', cite: 'Bahcall, J. N., Serenelli, A. M. & Basu, S. (2005). New solar opacities, abundances, helioseismology, and neutrino fluxes. ApJ 621, L85', use: 'use.interior' },
  { id: 'colwell2009', cite: 'Colwell, J. E. et al. (2009). The structure of Saturn’s rings. In: Saturn from Cassini-Huygens, Springer', use: 'use.rings' },
  // --- imagery ---
  { id: 'tex-earth', cite: 'NASA Earth Observatory — Blue Marble Next Generation, July 2004 (R. Stöckli et al.)', url: 'https://visibleearth.nasa.gov/images/74092', use: 'use.texture', note: 'NASA imagery, public domain.' },
  { id: 'tex-night', cite: 'NASA Earth Observatory / NOAA NGDC — Earth at Night 2012 (Suomi NPP VIIRS)', url: 'https://visibleearth.nasa.gov/images/79765', use: 'use.texture', note: 'NASA imagery, public domain.' },
  { id: 'tex-clouds', cite: 'NASA Visible Earth — global cloud composite', url: 'https://visibleearth.nasa.gov/images/57747', use: 'use.texture', note: 'NASA imagery, public domain.' },
  { id: 'tex-moon', cite: 'NASA Scientific Visualization Studio — CGI Moon Kit (LRO LROC WAC colour mosaic)', url: 'https://svs.gsfc.nasa.gov/4720', use: 'use.texture', note: 'NASA imagery, public domain.' },
  { id: 'tex-mars', cite: 'USGS Astrogeology / NASA Ames — Mars Viking Colorized Global Mosaic 925 m', url: 'https://astrogeology.usgs.gov/search/map/mars_viking_global_color_mosaic_925m', use: 'use.texture', note: 'USGS/NASA, public domain.' },
  { id: 'tex-mercury', cite: 'USGS / NASA / JHUAPL / Carnegie — MESSENGER MDIS Basemap Enhanced Color Global Mosaic 665 m (desaturated for true-colour view)', url: 'https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_basemap_enhanced_color_mosaic_665m', use: 'use.texture', note: 'USGS/NASA, public domain.' },
  { id: 'tex-jupiter', cite: 'NASA/JPL/Space Science Institute — Cassini cylindrical map of Jupiter, PIA07782', url: 'https://photojournal.jpl.nasa.gov/catalog/PIA07782', use: 'use.texture', note: 'Courtesy NASA/JPL-Caltech.' },
  { id: 'tex-opal', cite: 'Simon, A. A. et al. — Hubble Outer Planet Atmospheres Legacy (OPAL), GO 13937; latitude colour profiles of Saturn (2023), Uranus (2021), Neptune (2023)', url: 'https://archive.stsci.edu/hlsp/opal', use: 'use.texture', note: 'This work used data acquired from the NASA/ESA HST Space Telescope, associated with OPAL program (PI: Simon, GO13937), and archived by the Space Telescope Science Institute, which is operated by the Association of Universities for Research in Astronomy, Inc., under NASA contract NAS 5-26555. All maps are available at http://dx.doi.org/10.17909/T9G593.' },
  { id: 'irwin2024', cite: 'Irwin, P. G. J. et al. (2024). Modelling the seasonal cycle of Uranus’s colour and magnitude, and comparison with Neptune. MNRAS 527, 11521 — true-colour balance of the ice giants', use: 'use.texture' },
  { id: 'tex-pluto', cite: 'USGS / NASA / JHUAPL / SwRI — New Horizons LORRI/MVIC Pluto and Charon global mosaics 300 m (greyscale, colour-mapped here)', url: 'https://astrogeology.usgs.gov/search/map/pluto_new_horizons_lorri_mvic_global_mosaic_300m', use: 'use.texture', note: 'USGS/NASA, public domain.' },
  { id: 'tex-nasa3d', cite: 'NASA 3D Resources — moon maps (Galileo, Cassini, Voyager), Venus Magellan radar map', url: 'https://github.com/nasa/NASA-3D-Resources', use: 'use.texture', note: 'NASA imagery, see NASA media usage guidelines.' },
];

export const SOURCE: Record<string, Source> = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
