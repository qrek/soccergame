/*
 * Base de données des joueurs d'équipes nationales (années 1950 -> aujourd'hui).
 * Chaque joueur possède une note globale ("rating") inspirée de la note générale FIFA,
 * reflétant son niveau à son apogée en sélection.
 *
 * Champs :
 *   n    = nom
 *   c    = pays (nom de la sélection)
 *   code = code pays ISO-2 (pour le drapeau emoji)
 *   pos  = poste : GK (gardien), DEF (défenseur), MID (milieu), FWD (attaquant)
 *   r    = note globale (0-99)
 *   d    = décennie de référence en sélection
 */

const PLAYERS = [
  // ===================== BRÉSIL =====================
  { n: "Pelé", c: "Brésil", code: "BR", pos: "FWD", r: 98, d: "1960s" },
  { n: "Garrincha", c: "Brésil", code: "BR", pos: "FWD", r: 93, d: "1960s" },
  { n: "Didi", c: "Brésil", code: "BR", pos: "MID", r: 88, d: "1950s" },
  { n: "Nilton Santos", c: "Brésil", code: "BR", pos: "DEF", r: 87, d: "1950s" },
  { n: "Gilmar", c: "Brésil", code: "BR", pos: "GK", r: 85, d: "1960s" },
  { n: "Carlos Alberto", c: "Brésil", code: "BR", pos: "DEF", r: 89, d: "1970s" },
  { n: "Rivelino", c: "Brésil", code: "BR", pos: "MID", r: 89, d: "1970s" },
  { n: "Jairzinho", c: "Brésil", code: "BR", pos: "FWD", r: 88, d: "1970s" },
  { n: "Zico", c: "Brésil", code: "BR", pos: "MID", r: 92, d: "1980s" },
  { n: "Sócrates", c: "Brésil", code: "BR", pos: "MID", r: 90, d: "1980s" },
  { n: "Falcão", c: "Brésil", code: "BR", pos: "MID", r: 88, d: "1980s" },
  { n: "Romário", c: "Brésil", code: "BR", pos: "FWD", r: 93, d: "1990s" },
  { n: "Ronaldo", c: "Brésil", code: "BR", pos: "FWD", r: 96, d: "2000s" },
  { n: "Ronaldinho", c: "Brésil", code: "BR", pos: "MID", r: 94, d: "2000s" },
  { n: "Rivaldo", c: "Brésil", code: "BR", pos: "MID", r: 91, d: "2000s" },
  { n: "Cafu", c: "Brésil", code: "BR", pos: "DEF", r: 90, d: "2000s" },
  { n: "Roberto Carlos", c: "Brésil", code: "BR", pos: "DEF", r: 91, d: "2000s" },
  { n: "Kaká", c: "Brésil", code: "BR", pos: "MID", r: 91, d: "2000s" },
  { n: "Neymar", c: "Brésil", code: "BR", pos: "FWD", r: 92, d: "2010s" },
  { n: "Thiago Silva", c: "Brésil", code: "BR", pos: "DEF", r: 88, d: "2010s" },
  { n: "Alisson", c: "Brésil", code: "BR", pos: "GK", r: 89, d: "2020s" },
  { n: "Vinícius Jr", c: "Brésil", code: "BR", pos: "FWD", r: 89, d: "2020s" },

  // ===================== ARGENTINE =====================
  { n: "Alfredo Di Stéfano", c: "Argentine", code: "AR", pos: "FWD", r: 95, d: "1950s" },
  { n: "Diego Maradona", c: "Argentine", code: "AR", pos: "MID", r: 97, d: "1980s" },
  { n: "Mario Kempes", c: "Argentine", code: "AR", pos: "FWD", r: 88, d: "1970s" },
  { n: "Daniel Passarella", c: "Argentine", code: "AR", pos: "DEF", r: 87, d: "1980s" },
  { n: "Gabriel Batistuta", c: "Argentine", code: "AR", pos: "FWD", r: 91, d: "1990s" },
  { n: "Juan Verón", c: "Argentine", code: "AR", pos: "MID", r: 86, d: "2000s" },
  { n: "Javier Zanetti", c: "Argentine", code: "AR", pos: "DEF", r: 87, d: "2000s" },
  { n: "Lionel Messi", c: "Argentine", code: "AR", pos: "FWD", r: 98, d: "2020s" },
  { n: "Ángel Di María", c: "Argentine", code: "AR", pos: "MID", r: 87, d: "2010s" },
  { n: "Sergio Agüero", c: "Argentine", code: "AR", pos: "FWD", r: 89, d: "2010s" },
  { n: "Javier Mascherano", c: "Argentine", code: "AR", pos: "MID", r: 86, d: "2010s" },
  { n: "Emiliano Martínez", c: "Argentine", code: "AR", pos: "GK", r: 87, d: "2020s" },
  { n: "Julián Álvarez", c: "Argentine", code: "AR", pos: "FWD", r: 85, d: "2020s" },
  { n: "Enzo Fernández", c: "Argentine", code: "AR", pos: "MID", r: 84, d: "2020s" },

  // ===================== FRANCE =====================
  { n: "Just Fontaine", c: "France", code: "FR", pos: "FWD", r: 90, d: "1950s" },
  { n: "Raymond Kopa", c: "France", code: "FR", pos: "FWD", r: 90, d: "1950s" },
  { n: "Michel Platini", c: "France", code: "FR", pos: "MID", r: 94, d: "1980s" },
  { n: "Jean Tigana", c: "France", code: "FR", pos: "MID", r: 86, d: "1980s" },
  { n: "Alain Giresse", c: "France", code: "FR", pos: "MID", r: 85, d: "1980s" },
  { n: "Marcel Desailly", c: "France", code: "FR", pos: "DEF", r: 88, d: "1990s" },
  { n: "Laurent Blanc", c: "France", code: "FR", pos: "DEF", r: 86, d: "1990s" },
  { n: "Lilian Thuram", c: "France", code: "FR", pos: "DEF", r: 88, d: "2000s" },
  { n: "Zinédine Zidane", c: "France", code: "FR", pos: "MID", r: 96, d: "2000s" },
  { n: "Patrick Vieira", c: "France", code: "FR", pos: "MID", r: 88, d: "2000s" },
  { n: "Thierry Henry", c: "France", code: "FR", pos: "FWD", r: 92, d: "2000s" },
  { n: "Fabien Barthez", c: "France", code: "FR", pos: "GK", r: 85, d: "2000s" },
  { n: "Franck Ribéry", c: "France", code: "FR", pos: "MID", r: 88, d: "2010s" },
  { n: "Hugo Lloris", c: "France", code: "FR", pos: "GK", r: 87, d: "2010s" },
  { n: "Paul Pogba", c: "France", code: "FR", pos: "MID", r: 87, d: "2010s" },
  { n: "N'Golo Kanté", c: "France", code: "FR", pos: "MID", r: 88, d: "2010s" },
  { n: "Antoine Griezmann", c: "France", code: "FR", pos: "FWD", r: 89, d: "2010s" },
  { n: "Kylian Mbappé", c: "France", code: "FR", pos: "FWD", r: 94, d: "2020s" },
  { n: "Raphaël Varane", c: "France", code: "FR", pos: "DEF", r: 87, d: "2020s" },

  // ===================== ALLEMAGNE =====================
  { n: "Fritz Walter", c: "Allemagne", code: "DE", pos: "FWD", r: 88, d: "1950s" },
  { n: "Uwe Seeler", c: "Allemagne", code: "DE", pos: "FWD", r: 87, d: "1960s" },
  { n: "Franz Beckenbauer", c: "Allemagne", code: "DE", pos: "DEF", r: 95, d: "1970s" },
  { n: "Gerd Müller", c: "Allemagne", code: "DE", pos: "FWD", r: 93, d: "1970s" },
  { n: "Sepp Maier", c: "Allemagne", code: "DE", pos: "GK", r: 87, d: "1970s" },
  { n: "Paul Breitner", c: "Allemagne", code: "DE", pos: "MID", r: 87, d: "1970s" },
  { n: "Karl-Heinz Rummenigge", c: "Allemagne", code: "DE", pos: "FWD", r: 90, d: "1980s" },
  { n: "Lothar Matthäus", c: "Allemagne", code: "DE", pos: "MID", r: 92, d: "1990s" },
  { n: "Jürgen Klinsmann", c: "Allemagne", code: "DE", pos: "FWD", r: 89, d: "1990s" },
  { n: "Andreas Brehme", c: "Allemagne", code: "DE", pos: "DEF", r: 86, d: "1990s" },
  { n: "Oliver Kahn", c: "Allemagne", code: "DE", pos: "GK", r: 90, d: "2000s" },
  { n: "Michael Ballack", c: "Allemagne", code: "DE", pos: "MID", r: 88, d: "2000s" },
  { n: "Miroslav Klose", c: "Allemagne", code: "DE", pos: "FWD", r: 88, d: "2010s" },
  { n: "Philipp Lahm", c: "Allemagne", code: "DE", pos: "DEF", r: 89, d: "2010s" },
  { n: "Bastian Schweinsteiger", c: "Allemagne", code: "DE", pos: "MID", r: 89, d: "2010s" },
  { n: "Manuel Neuer", c: "Allemagne", code: "DE", pos: "GK", r: 91, d: "2010s" },
  { n: "Toni Kroos", c: "Allemagne", code: "DE", pos: "MID", r: 89, d: "2010s" },
  { n: "Thomas Müller", c: "Allemagne", code: "DE", pos: "FWD", r: 87, d: "2010s" },

  // ===================== ITALIE =====================
  { n: "Gianni Rivera", c: "Italie", code: "IT", pos: "MID", r: 88, d: "1970s" },
  { n: "Dino Zoff", c: "Italie", code: "IT", pos: "GK", r: 90, d: "1980s" },
  { n: "Paolo Rossi", c: "Italie", code: "IT", pos: "FWD", r: 88, d: "1980s" },
  { n: "Gaetano Scirea", c: "Italie", code: "IT", pos: "DEF", r: 88, d: "1980s" },
  { n: "Franco Baresi", c: "Italie", code: "IT", pos: "DEF", r: 91, d: "1990s" },
  { n: "Paolo Maldini", c: "Italie", code: "IT", pos: "DEF", r: 93, d: "1990s" },
  { n: "Roberto Baggio", c: "Italie", code: "IT", pos: "FWD", r: 92, d: "1990s" },
  { n: "Alessandro Del Piero", c: "Italie", code: "IT", pos: "FWD", r: 89, d: "2000s" },
  { n: "Fabio Cannavaro", c: "Italie", code: "IT", pos: "DEF", r: 90, d: "2000s" },
  { n: "Gianluigi Buffon", c: "Italie", code: "IT", pos: "GK", r: 92, d: "2000s" },
  { n: "Andrea Pirlo", c: "Italie", code: "IT", pos: "MID", r: 90, d: "2010s" },
  { n: "Francesco Totti", c: "Italie", code: "IT", pos: "FWD", r: 89, d: "2000s" },
  { n: "Gennaro Gattuso", c: "Italie", code: "IT", pos: "MID", r: 85, d: "2000s" },
  { n: "Giorgio Chiellini", c: "Italie", code: "IT", pos: "DEF", r: 87, d: "2010s" },
  { n: "Leonardo Bonucci", c: "Italie", code: "IT", pos: "DEF", r: 86, d: "2010s" },

  // ===================== PAYS-BAS =====================
  { n: "Johan Cruyff", c: "Pays-Bas", code: "NL", pos: "FWD", r: 96, d: "1970s" },
  { n: "Johan Neeskens", c: "Pays-Bas", code: "NL", pos: "MID", r: 88, d: "1970s" },
  { n: "Ruud Krol", c: "Pays-Bas", code: "NL", pos: "DEF", r: 86, d: "1970s" },
  { n: "Ruud Gullit", c: "Pays-Bas", code: "NL", pos: "MID", r: 91, d: "1980s" },
  { n: "Marco van Basten", c: "Pays-Bas", code: "NL", pos: "FWD", r: 93, d: "1990s" },
  { n: "Frank Rijkaard", c: "Pays-Bas", code: "NL", pos: "MID", r: 89, d: "1990s" },
  { n: "Dennis Bergkamp", c: "Pays-Bas", code: "NL", pos: "FWD", r: 90, d: "1990s" },
  { n: "Edwin van der Sar", c: "Pays-Bas", code: "NL", pos: "GK", r: 88, d: "2000s" },
  { n: "Clarence Seedorf", c: "Pays-Bas", code: "NL", pos: "MID", r: 87, d: "2000s" },
  { n: "Ruud van Nistelrooy", c: "Pays-Bas", code: "NL", pos: "FWD", r: 89, d: "2000s" },
  { n: "Arjen Robben", c: "Pays-Bas", code: "NL", pos: "FWD", r: 90, d: "2010s" },
  { n: "Wesley Sneijder", c: "Pays-Bas", code: "NL", pos: "MID", r: 88, d: "2010s" },
  { n: "Robin van Persie", c: "Pays-Bas", code: "NL", pos: "FWD", r: 88, d: "2010s" },
  { n: "Virgil van Dijk", c: "Pays-Bas", code: "NL", pos: "DEF", r: 90, d: "2020s" },

  // ===================== PORTUGAL =====================
  { n: "Eusébio", c: "Portugal", code: "PT", pos: "FWD", r: 94, d: "1960s" },
  { n: "Mário Coluna", c: "Portugal", code: "PT", pos: "MID", r: 85, d: "1960s" },
  { n: "Luís Figo", c: "Portugal", code: "PT", pos: "MID", r: 91, d: "2000s" },
  { n: "Rui Costa", c: "Portugal", code: "PT", pos: "MID", r: 87, d: "2000s" },
  { n: "Cristiano Ronaldo", c: "Portugal", code: "PT", pos: "FWD", r: 96, d: "2010s" },
  { n: "Pepe", c: "Portugal", code: "PT", pos: "DEF", r: 85, d: "2010s" },
  { n: "Ricardo Carvalho", c: "Portugal", code: "PT", pos: "DEF", r: 85, d: "2000s" },
  { n: "Bruno Fernandes", c: "Portugal", code: "PT", pos: "MID", r: 87, d: "2020s" },
  { n: "Bernardo Silva", c: "Portugal", code: "PT", pos: "MID", r: 87, d: "2020s" },
  { n: "Rúben Dias", c: "Portugal", code: "PT", pos: "DEF", r: 88, d: "2020s" },

  // ===================== ESPAGNE =====================
  { n: "Luis Suárez Miramontes", c: "Espagne", code: "ES", pos: "MID", r: 89, d: "1960s" },
  { n: "Emilio Butragueño", c: "Espagne", code: "ES", pos: "FWD", r: 86, d: "1980s" },
  { n: "Andoni Zubizarreta", c: "Espagne", code: "ES", pos: "GK", r: 85, d: "1990s" },
  { n: "Raúl", c: "Espagne", code: "ES", pos: "FWD", r: 89, d: "2000s" },
  { n: "Iker Casillas", c: "Espagne", code: "ES", pos: "GK", r: 91, d: "2010s" },
  { n: "Carles Puyol", c: "Espagne", code: "ES", pos: "DEF", r: 88, d: "2010s" },
  { n: "Sergio Ramos", c: "Espagne", code: "ES", pos: "DEF", r: 90, d: "2010s" },
  { n: "Xavi", c: "Espagne", code: "ES", pos: "MID", r: 91, d: "2010s" },
  { n: "Andrés Iniesta", c: "Espagne", code: "ES", pos: "MID", r: 92, d: "2010s" },
  { n: "Sergio Busquets", c: "Espagne", code: "ES", pos: "MID", r: 88, d: "2010s" },
  { n: "David Villa", c: "Espagne", code: "ES", pos: "FWD", r: 88, d: "2010s" },
  { n: "Fernando Torres", c: "Espagne", code: "ES", pos: "FWD", r: 87, d: "2010s" },
  { n: "Pedri", c: "Espagne", code: "ES", pos: "MID", r: 85, d: "2020s" },

  // ===================== ANGLETERRE =====================
  { n: "Bobby Moore", c: "Angleterre", code: "GB", pos: "DEF", r: 91, d: "1960s" },
  { n: "Bobby Charlton", c: "Angleterre", code: "GB", pos: "MID", r: 92, d: "1960s" },
  { n: "Gordon Banks", c: "Angleterre", code: "GB", pos: "GK", r: 89, d: "1960s" },
  { n: "Geoff Hurst", c: "Angleterre", code: "GB", pos: "FWD", r: 87, d: "1960s" },
  { n: "Kevin Keegan", c: "Angleterre", code: "GB", pos: "FWD", r: 87, d: "1980s" },
  { n: "Gary Lineker", c: "Angleterre", code: "GB", pos: "FWD", r: 88, d: "1990s" },
  { n: "Paul Gascoigne", c: "Angleterre", code: "GB", pos: "MID", r: 88, d: "1990s" },
  { n: "David Beckham", c: "Angleterre", code: "GB", pos: "MID", r: 88, d: "2000s" },
  { n: "Steven Gerrard", c: "Angleterre", code: "GB", pos: "MID", r: 89, d: "2000s" },
  { n: "Frank Lampard", c: "Angleterre", code: "GB", pos: "MID", r: 88, d: "2000s" },
  { n: "Wayne Rooney", c: "Angleterre", code: "GB", pos: "FWD", r: 89, d: "2010s" },
  { n: "John Terry", c: "Angleterre", code: "GB", pos: "DEF", r: 86, d: "2000s" },
  { n: "Harry Kane", c: "Angleterre", code: "GB", pos: "FWD", r: 90, d: "2020s" },
  { n: "Jude Bellingham", c: "Angleterre", code: "GB", pos: "MID", r: 88, d: "2020s" },

  // ===================== URUGUAY =====================
  { n: "Juan Alberto Schiaffino", c: "Uruguay", code: "UY", pos: "MID", r: 89, d: "1950s" },
  { n: "Obdulio Varela", c: "Uruguay", code: "UY", pos: "MID", r: 86, d: "1950s" },
  { n: "Enzo Francescoli", c: "Uruguay", code: "UY", pos: "MID", r: 88, d: "1990s" },
  { n: "Diego Forlán", c: "Uruguay", code: "UY", pos: "FWD", r: 87, d: "2010s" },
  { n: "Luis Suárez", c: "Uruguay", code: "UY", pos: "FWD", r: 90, d: "2010s" },
  { n: "Edinson Cavani", c: "Uruguay", code: "UY", pos: "FWD", r: 87, d: "2010s" },
  { n: "Diego Godín", c: "Uruguay", code: "UY", pos: "DEF", r: 87, d: "2010s" },
  { n: "Fernando Muslera", c: "Uruguay", code: "UY", pos: "GK", r: 83, d: "2010s" },

  // ===================== HONGRIE =====================
  { n: "Ferenc Puskás", c: "Hongrie", code: "HU", pos: "FWD", r: 95, d: "1950s" },
  { n: "Sándor Kocsis", c: "Hongrie", code: "HU", pos: "FWD", r: 90, d: "1950s" },
  { n: "Nándor Hidegkuti", c: "Hongrie", code: "HU", pos: "FWD", r: 88, d: "1950s" },
  { n: "József Bozsik", c: "Hongrie", code: "HU", pos: "MID", r: 87, d: "1950s" },
  { n: "Gyula Grosics", c: "Hongrie", code: "HU", pos: "GK", r: 85, d: "1950s" },

  // ===================== BELGIQUE =====================
  { n: "Jan Ceulemans", c: "Belgique", code: "BE", pos: "FWD", r: 85, d: "1980s" },
  { n: "Jean-Marie Pfaff", c: "Belgique", code: "BE", pos: "GK", r: 85, d: "1980s" },
  { n: "Enzo Scifo", c: "Belgique", code: "BE", pos: "MID", r: 85, d: "1990s" },
  { n: "Eden Hazard", c: "Belgique", code: "BE", pos: "MID", r: 90, d: "2020s" },
  { n: "Kevin De Bruyne", c: "Belgique", code: "BE", pos: "MID", r: 92, d: "2020s" },
  { n: "Romelu Lukaku", c: "Belgique", code: "BE", pos: "FWD", r: 87, d: "2020s" },
  { n: "Thibaut Courtois", c: "Belgique", code: "BE", pos: "GK", r: 90, d: "2020s" },
  { n: "Vincent Kompany", c: "Belgique", code: "BE", pos: "DEF", r: 87, d: "2010s" },

  // ===================== CROATIE =====================
  { n: "Davor Šuker", c: "Croatie", code: "HR", pos: "FWD", r: 88, d: "1990s" },
  { n: "Zvonimir Boban", c: "Croatie", code: "HR", pos: "MID", r: 86, d: "1990s" },
  { n: "Robert Prosinečki", c: "Croatie", code: "HR", pos: "MID", r: 85, d: "1990s" },
  { n: "Luka Modrić", c: "Croatie", code: "HR", pos: "MID", r: 91, d: "2020s" },
  { n: "Ivan Rakitić", c: "Croatie", code: "HR", pos: "MID", r: 86, d: "2010s" },
  { n: "Mario Mandžukić", c: "Croatie", code: "HR", pos: "FWD", r: 85, d: "2010s" },

  // ===================== POLOGNE =====================
  { n: "Kazimierz Deyna", c: "Pologne", code: "PL", pos: "MID", r: 87, d: "1970s" },
  { n: "Grzegorz Lato", c: "Pologne", code: "PL", pos: "FWD", r: 86, d: "1970s" },
  { n: "Zbigniew Boniek", c: "Pologne", code: "PL", pos: "FWD", r: 87, d: "1980s" },
  { n: "Robert Lewandowski", c: "Pologne", code: "PL", pos: "FWD", r: 91, d: "2020s" },

  // ===================== RUSSIE / URSS =====================
  { n: "Lev Yashin", c: "URSS", code: "RU", pos: "GK", r: 93, d: "1960s" },
  { n: "Valentin Ivanov", c: "URSS", code: "RU", pos: "FWD", r: 85, d: "1960s" },
  { n: "Oleg Blokhin", c: "URSS", code: "RU", pos: "FWD", r: 87, d: "1970s" },
  { n: "Rinat Dasayev", c: "URSS", code: "RU", pos: "GK", r: 86, d: "1980s" },
  { n: "Andrei Arshavin", c: "Russie", code: "RU", pos: "MID", r: 84, d: "2010s" },

  // ===================== DANEMARK =====================
  { n: "Michael Laudrup", c: "Danemark", code: "DK", pos: "MID", r: 89, d: "1990s" },
  { n: "Brian Laudrup", c: "Danemark", code: "DK", pos: "FWD", r: 86, d: "1990s" },
  { n: "Peter Schmeichel", c: "Danemark", code: "DK", pos: "GK", r: 90, d: "1990s" },
  { n: "Christian Eriksen", c: "Danemark", code: "DK", pos: "MID", r: 85, d: "2020s" },

  // ===================== SUÈDE =====================
  { n: "Gunnar Nordahl", c: "Suède", code: "SE", pos: "FWD", r: 88, d: "1950s" },
  { n: "Nils Liedholm", c: "Suède", code: "SE", pos: "MID", r: 86, d: "1950s" },
  { n: "Henrik Larsson", c: "Suède", code: "SE", pos: "FWD", r: 86, d: "2000s" },
  { n: "Zlatan Ibrahimović", c: "Suède", code: "SE", pos: "FWD", r: 90, d: "2010s" },

  // ===================== CAMEROUN =====================
  { n: "Roger Milla", c: "Cameroun", code: "CM", pos: "FWD", r: 86, d: "1990s" },
  { n: "Thomas N'Kono", c: "Cameroun", code: "CM", pos: "GK", r: 84, d: "1990s" },
  { n: "Samuel Eto'o", c: "Cameroun", code: "CM", pos: "FWD", r: 89, d: "2000s" },
  { n: "Rigobert Song", c: "Cameroun", code: "CM", pos: "DEF", r: 82, d: "2000s" },

  // ===================== GHANA / NIGERIA / CÔTE D'IVOIRE =====================
  { n: "Abedi Pelé", c: "Ghana", code: "GH", pos: "MID", r: 86, d: "1990s" },
  { n: "Michael Essien", c: "Ghana", code: "GH", pos: "MID", r: 85, d: "2000s" },
  { n: "Jay-Jay Okocha", c: "Nigeria", code: "NG", pos: "MID", r: 87, d: "2000s" },
  { n: "Nwankwo Kanu", c: "Nigeria", code: "NG", pos: "FWD", r: 85, d: "2000s" },
  { n: "Didier Drogba", c: "Côte d'Ivoire", code: "CI", pos: "FWD", r: 89, d: "2010s" },
  { n: "Yaya Touré", c: "Côte d'Ivoire", code: "CI", pos: "MID", r: 87, d: "2010s" },

  // ===================== MEXIQUE / USA =====================
  { n: "Hugo Sánchez", c: "Mexique", code: "MX", pos: "FWD", r: 88, d: "1980s" },
  { n: "Rafael Márquez", c: "Mexique", code: "MX", pos: "DEF", r: 84, d: "2000s" },
  { n: "Guillermo Ochoa", c: "Mexique", code: "MX", pos: "GK", r: 83, d: "2010s" },
  { n: "Landon Donovan", c: "États-Unis", code: "US", pos: "FWD", r: 83, d: "2010s" },
  { n: "Christian Pulisic", c: "États-Unis", code: "US", pos: "MID", r: 84, d: "2020s" },

  // ===================== AUTRES LÉGENDES =====================
  { n: "George Best", c: "Irlande du Nord", code: "GB", pos: "FWD", r: 91, d: "1970s" },
  { n: "George Weah", c: "Liberia", code: "LR", pos: "FWD", r: 89, d: "1990s" },
  { n: "Hristo Stoichkov", c: "Bulgarie", code: "BG", pos: "FWD", r: 89, d: "1990s" },
  { n: "Gheorghe Hagi", c: "Roumanie", code: "RO", pos: "MID", r: 88, d: "1990s" },
  { n: "Pavel Nedvěd", c: "Rép. tchèque", code: "CZ", pos: "MID", r: 88, d: "2000s" },
  { n: "Andriy Shevchenko", c: "Ukraine", code: "UA", pos: "FWD", r: 90, d: "2000s" },
  { n: "Alexander Hleb", c: "Biélorussie", code: "BY", pos: "MID", r: 82, d: "2000s" },
  { n: "Son Heung-min", c: "Corée du Sud", code: "KR", pos: "FWD", r: 87, d: "2020s" },
  { n: "Hidetoshi Nakata", c: "Japon", code: "JP", pos: "MID", r: 84, d: "2000s" },
  { n: "Keisuke Honda", c: "Japon", code: "JP", pos: "MID", r: 83, d: "2010s" },
  { n: "Mohamed Salah", c: "Égypte", code: "EG", pos: "FWD", r: 90, d: "2020s" },
  { n: "Riyad Mahrez", c: "Algérie", code: "DZ", pos: "MID", r: 85, d: "2020s" },
  { n: "Achraf Hakimi", c: "Maroc", code: "MA", pos: "DEF", r: 85, d: "2020s" },
  { n: "Sadio Mané", c: "Sénégal", code: "SN", pos: "FWD", r: 88, d: "2020s" },
  { n: "Alan Shearer", c: "Angleterre", code: "GB", pos: "FWD", r: 89, d: "1990s" },
  { n: "Gianfranco Zola", c: "Italie", code: "IT", pos: "FWD", r: 86, d: "1990s" },
  { n: "Ronald Koeman", c: "Pays-Bas", code: "NL", pos: "DEF", r: 87, d: "1990s" },
  { n: "Rai", c: "Brésil", code: "BR", pos: "MID", r: 85, d: "1990s" },
  { n: "Bebeto", c: "Brésil", code: "BR", pos: "FWD", r: 86, d: "1990s" },
  { n: "Claudio Caniggia", c: "Argentine", code: "AR", pos: "FWD", r: 85, d: "1990s" },

  // ===================== RENFORTS DÉFENSEURS & GARDIENS (profondeur d'effectif) =====================
  { n: "Djalma Santos", c: "Brésil", code: "BR", pos: "DEF", r: 87, d: "1960s" },
  { n: "Aldair", c: "Brésil", code: "BR", pos: "DEF", r: 85, d: "1990s" },
  { n: "Marquinhos", c: "Brésil", code: "BR", pos: "DEF", r: 86, d: "2020s" },
  { n: "Taffarel", c: "Brésil", code: "BR", pos: "GK", r: 84, d: "1990s" },
  { n: "Ederson", c: "Brésil", code: "BR", pos: "GK", r: 88, d: "2020s" },
  { n: "Oscar Ruggeri", c: "Argentine", code: "AR", pos: "DEF", r: 85, d: "1990s" },
  { n: "Roberto Ayala", c: "Argentine", code: "AR", pos: "DEF", r: 85, d: "2000s" },
  { n: "Nicolás Otamendi", c: "Argentine", code: "AR", pos: "DEF", r: 83, d: "2020s" },
  { n: "Manuel Amoros", c: "France", code: "FR", pos: "DEF", r: 84, d: "1980s" },
  { n: "Bixente Lizarazu", c: "France", code: "FR", pos: "DEF", r: 86, d: "2000s" },
  { n: "William Gallas", c: "France", code: "FR", pos: "DEF", r: 84, d: "2000s" },
  { n: "Berti Vogts", c: "Allemagne", code: "DE", pos: "DEF", r: 85, d: "1970s" },
  { n: "Jürgen Kohler", c: "Allemagne", code: "DE", pos: "DEF", r: 85, d: "1990s" },
  { n: "Mats Hummels", c: "Allemagne", code: "DE", pos: "DEF", r: 87, d: "2010s" },
  { n: "Jérôme Boateng", c: "Allemagne", code: "DE", pos: "DEF", r: 85, d: "2010s" },
  { n: "Claudio Gentile", c: "Italie", code: "IT", pos: "DEF", r: 85, d: "1980s" },
  { n: "Alessandro Nesta", c: "Italie", code: "IT", pos: "DEF", r: 89, d: "2000s" },
  { n: "Gianluca Zambrotta", c: "Italie", code: "IT", pos: "DEF", r: 84, d: "2000s" },
  { n: "Walter Zenga", c: "Italie", code: "IT", pos: "GK", r: 84, d: "1990s" },
  { n: "Jaap Stam", c: "Pays-Bas", code: "NL", pos: "DEF", r: 87, d: "2000s" },
  { n: "Fernando Hierro", c: "Espagne", code: "ES", pos: "DEF", r: 86, d: "2000s" },
  { n: "Gerard Piqué", c: "Espagne", code: "ES", pos: "DEF", r: 88, d: "2010s" },
  { n: "Jordi Alba", c: "Espagne", code: "ES", pos: "DEF", r: 85, d: "2010s" },
  { n: "Ashley Cole", c: "Angleterre", code: "GB", pos: "DEF", r: 86, d: "2000s" },
  { n: "Rio Ferdinand", c: "Angleterre", code: "GB", pos: "DEF", r: 87, d: "2000s" },
  { n: "Kyle Walker", c: "Angleterre", code: "GB", pos: "DEF", r: 84, d: "2020s" },
  { n: "Fábio Coentrão", c: "Portugal", code: "PT", pos: "DEF", r: 83, d: "2010s" },
  { n: "José Fonte", c: "Portugal", code: "PT", pos: "DEF", r: 82, d: "2010s" },
  { n: "Petr Čech", c: "Rép. tchèque", code: "CZ", pos: "GK", r: 89, d: "2010s" },
  { n: "Keylor Navas", c: "Costa Rica", code: "CR", pos: "GK", r: 85, d: "2020s" },
  { n: "Kasper Schmeichel", c: "Danemark", code: "DK", pos: "GK", r: 83, d: "2020s" },
  { n: "Wojciech Szczęsny", c: "Pologne", code: "PL", pos: "GK", r: 84, d: "2020s" },

  // ===================== PLUS D'ÉQUIPES DE COUPE DU MONDE =====================
  // Pérou
  { n: "Teófilo Cubillas", c: "Pérou", code: "PE", pos: "MID", r: 87, d: "1970s" },
  { n: "Héctor Chumpitaz", c: "Pérou", code: "PE", pos: "DEF", r: 82, d: "1970s" },
  { n: "Paolo Guerrero", c: "Pérou", code: "PE", pos: "FWD", r: 82, d: "2010s" },
  // Chili
  { n: "Elías Figueroa", c: "Chili", code: "CL", pos: "DEF", r: 87, d: "1970s" },
  { n: "Iván Zamorano", c: "Chili", code: "CL", pos: "FWD", r: 85, d: "1990s" },
  { n: "Marcelo Salas", c: "Chili", code: "CL", pos: "FWD", r: 85, d: "2000s" },
  { n: "Alexis Sánchez", c: "Chili", code: "CL", pos: "FWD", r: 86, d: "2010s" },
  { n: "Arturo Vidal", c: "Chili", code: "CL", pos: "MID", r: 86, d: "2010s" },
  { n: "Claudio Bravo", c: "Chili", code: "CL", pos: "GK", r: 84, d: "2010s" },
  // Colombie
  { n: "Carlos Valderrama", c: "Colombie", code: "CO", pos: "MID", r: 87, d: "1990s" },
  { n: "Faustino Asprilla", c: "Colombie", code: "CO", pos: "FWD", r: 84, d: "1990s" },
  { n: "René Higuita", c: "Colombie", code: "CO", pos: "GK", r: 82, d: "1990s" },
  { n: "James Rodríguez", c: "Colombie", code: "CO", pos: "MID", r: 86, d: "2010s" },
  { n: "Radamel Falcao", c: "Colombie", code: "CO", pos: "FWD", r: 87, d: "2010s" },
  // Paraguay
  { n: "José Luis Chilavert", c: "Paraguay", code: "PY", pos: "GK", r: 85, d: "2000s" },
  { n: "Roque Santa Cruz", c: "Paraguay", code: "PY", pos: "FWD", r: 82, d: "2000s" },
  // Turquie
  { n: "Rüştü Reçber", c: "Turquie", code: "TR", pos: "GK", r: 84, d: "2000s" },
  { n: "Hakan Şükür", c: "Turquie", code: "TR", pos: "FWD", r: 84, d: "2000s" },
  // Corée du Sud
  { n: "Park Ji-sung", c: "Corée du Sud", code: "KR", pos: "MID", r: 84, d: "2000s" },
  { n: "Hong Myung-bo", c: "Corée du Sud", code: "KR", pos: "DEF", r: 82, d: "2000s" },
  // Serbie / Yougoslavie
  { n: "Dragan Džajić", c: "Yougoslavie", code: "RS", pos: "FWD", r: 86, d: "1970s" },
  { n: "Dejan Savićević", c: "Yougoslavie", code: "RS", pos: "MID", r: 86, d: "1990s" },
  { n: "Nemanja Vidić", c: "Serbie", code: "RS", pos: "DEF", r: 87, d: "2010s" },
  { n: "Dušan Tadić", c: "Serbie", code: "RS", pos: "MID", r: 83, d: "2020s" },
  // Suisse
  { n: "Xherdan Shaqiri", c: "Suisse", code: "CH", pos: "MID", r: 83, d: "2010s" },
  { n: "Granit Xhaka", c: "Suisse", code: "CH", pos: "MID", r: 83, d: "2020s" },
  // Australie
  { n: "Tim Cahill", c: "Australie", code: "AU", pos: "FWD", r: 82, d: "2010s" },
  { n: "Mark Schwarzer", c: "Australie", code: "AU", pos: "GK", r: 82, d: "2010s" },
  // Nigeria
  { n: "Rashidi Yekini", c: "Nigeria", code: "NG", pos: "FWD", r: 83, d: "1990s" },
  { n: "Finidi George", c: "Nigeria", code: "NG", pos: "MID", r: 82, d: "1990s" },
  // Algérie
  { n: "Rabah Madjer", c: "Algérie", code: "DZ", pos: "FWD", r: 84, d: "1980s" },
  { n: "Lakhdar Belloumi", c: "Algérie", code: "DZ", pos: "MID", r: 83, d: "1980s" },
  // Ghana
  { n: "Asamoah Gyan", c: "Ghana", code: "GH", pos: "FWD", r: 83, d: "2010s" },
  // Maroc
  { n: "Hakim Ziyech", c: "Maroc", code: "MA", pos: "MID", r: 84, d: "2020s" },
  { n: "Yassine Bounou", c: "Maroc", code: "MA", pos: "GK", r: 84, d: "2020s" },
  // Écosse
  { n: "Kenny Dalglish", c: "Écosse", code: "GB", pos: "FWD", r: 88, d: "1980s" },
  { n: "Denis Law", c: "Écosse", code: "GB", pos: "FWD", r: 87, d: "1970s" },
  // Pays de Galles
  { n: "Ian Rush", c: "Pays de Galles", code: "GB", pos: "FWD", r: 85, d: "1990s" },
  { n: "Gareth Bale", c: "Pays de Galles", code: "GB", pos: "FWD", r: 88, d: "2010s" },
  { n: "Ryan Giggs", c: "Pays de Galles", code: "GB", pos: "MID", r: 87, d: "2000s" },
  // Irlande
  { n: "Roy Keane", c: "Irlande", code: "IE", pos: "MID", r: 87, d: "2000s" },
  { n: "Robbie Keane", c: "Irlande", code: "IE", pos: "FWD", r: 82, d: "2000s" },
  // Autriche
  { n: "David Alaba", c: "Autriche", code: "AT", pos: "DEF", r: 85, d: "2020s" },
  // Équateur
  { n: "Antonio Valencia", c: "Équateur", code: "EC", pos: "MID", r: 82, d: "2010s" },
  // Grèce
  { n: "Theodoros Zagorakis", c: "Grèce", code: "GR", pos: "MID", r: 82, d: "2000s" },
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = PLAYERS;
}
