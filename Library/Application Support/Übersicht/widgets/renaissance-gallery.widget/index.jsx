// Renaissance Gallery — an educational artwork widget for Übersicht.
// The curated, public-domain selection changes every ten minutes. Images are served
// at 1280 px by Wikimedia Commons: sharp on Retina without downloading the
// enormous archival originals.

const ARTWORKS = [
  {
    title: "The Birth of Venus",
    artist: "Sandro Botticelli",
    date: "c. 1484–1486",
    museum: "Uffizi Galleries, Florence",
    description:
      "Venus reaches the shore on a shell, blown by Zephyrus and welcomed by a Hora carrying a flowered cloak.",
    file:
      "Sandro Botticelli - La nascita di Venere - Google Art Project - edited.jpg",
    shard: "0/0b",
  },
  {
    title: "Mona Lisa",
    artist: "Leonardo da Vinci",
    date: "c. 1503–1519",
    museum: "Musée du Louvre, Paris",
    description:
      "A sitter traditionally identified as Lisa Gherardini turns toward us before an imaginary landscape, softened by Leonardo’s sfumato.",
    file: "Mona Lisa, by Leonardo da Vinci, from C2RMF retouched.jpg",
    shard: "e/ec",
  },
  {
    title: "The School of Athens",
    artist: "Raphael",
    date: "1509–1511",
    museum: "Apostolic Palace, Vatican City",
    description:
      "An imagined assembly of ancient thinkers fills a perfect classical space; Plato and Aristotle walk at its vanishing point.",
    file: "The School of Athens by Raphael (Vatican).jpg",
    shard: "6/68",
  },
  {
    title: "The Creation of Adam",
    artist: "Michelangelo",
    date: "c. 1508–1512",
    museum: "Sistine Chapel, Vatican City",
    description:
      "God reaches across a narrow gap to give life to Adam. Their nearly touching hands make the instant of creation visible.",
    file: "The Creation of Adam perspective fix.jpg",
    shard: "2/29",
  },
  {
    title: "The Arnolfini Portrait",
    artist: "Jan van Eyck",
    date: "1434",
    museum: "National Gallery, London",
    description:
      "A richly dressed couple stand in a Bruges interior. The convex mirror reflects two more figures; the scene’s exact meaning remains debated.",
    file: "Van Eyck - Arnolfini Portrait.jpg",
    shard: "3/33",
  },
  {
    title: "The Descent from the Cross",
    artist: "Rogier van der Weyden",
    date: "c. 1435",
    museum: "Museo del Prado, Madrid",
    description:
      "Christ is lowered from the cross as the collapsing Virgin echoes his pose, binding the mourners into one compressed arc of grief.",
    file:
      "El Descendimiento, by Rogier van der Weyden, from Prado in Google Earth.jpg",
    shard: "5/5a",
  },
  {
    title: "Bacchus and Ariadne",
    artist: "Titian",
    date: "1520–1523",
    museum: "National Gallery, London",
    description:
      "Abandoned by Theseus, Ariadne meets Bacchus as he leaps from his chariot. Her future constellation appears above her.",
    file: "Titian Bacchus and Ariadne.jpg",
    shard: "b/be",
  },
  {
    title: "The Tempest",
    artist: "Giorgione",
    date: "c. 1506–1508",
    museum: "Gallerie dell’Accademia, Venice",
    description:
      "A soldier and a nursing woman occupy opposite banks beneath a flash of lightning. No single narrative for the enigmatic scene is accepted.",
    file: "Giorgione, The tempest.jpg",
    shard: "f/fa",
  },
  {
    title: "The Baptism of Christ",
    artist: "Piero della Francesca",
    date: "c. 1437–1445",
    museum: "National Gallery, London",
    description:
      "John baptizes Christ beneath a hovering dove. Piero’s pale light and geometric stillness turn the Tuscan setting into sacred order.",
    file:
      "Piero della Francesca - Battesimo di Cristo (National Gallery, London).jpg",
    shard: "9/92",
  },
  {
    title: "Lamentation over the Dead Christ",
    artist: "Andrea Mantegna",
    date: "c. 1480",
    museum: "Pinacoteca di Brera, Milan",
    description:
      "Christ’s body projects toward the viewer in a daring foreshortened view while three mourners grieve at the edge of the slab.",
    file:
      "The dead Christ with three mourners (by Andrea Mantegna) – Pinacoteca di Brera.jpg",
    shard: "f/f0",
  },
  {
    title: "The Ambassadors",
    artist: "Hans Holbein the Younger",
    date: "1533",
    museum: "National Gallery, London",
    description:
      "Two French envoys flank instruments of learning and power. Viewed obliquely, the stretched shape at their feet resolves into a skull.",
    file:
      "Hans Holbein the Younger - The Ambassadors - Google Art Project.jpg",
    shard: "8/88",
  },
  {
    title: "Self-Portrait at Twenty-Eight",
    artist: "Albrecht Dürer",
    date: "1500",
    museum: "Alte Pinakothek, Munich",
    description:
      "Dürer faces us frontally in a pose then associated with images of Christ, asserting the artist’s intellect and creative dignity.",
    file:
      "Albrecht Dürer - 1500 self-portrait (High resolution and detail).jpg",
    shard: "d/dc",
  },
  {
    title: "Hunters in the Snow",
    artist: "Pieter Bruegel the Elder",
    date: "1565",
    museum: "Kunsthistorisches Museum, Vienna",
    description:
      "Hunters return with meagre spoils above a valley of skaters and workers, making winter landscape the true subject of the scene.",
    file:
      "Pieter Bruegel the Elder - Hunters in the Snow (Winter) - Google Art Project.jpg",
    shard: "d/d8",
  },
  {
    title: "Primavera",
    artist: "Sandro Botticelli",
    date: "c. 1477–1482",
    museum: "Uffizi Galleries, Florence",
    description:
      "Venus presides over an orange grove as Zephyrus pursues Chloris, Flora scatters flowers, and the Three Graces dance.",
    file: "Sandro Botticelli - La Primavera - Google Art Project.jpg",
    shard: "2/25",
  },
  {
    title: "San Zaccaria Altarpiece",
    artist: "Giovanni Bellini",
    date: "1505",
    museum: "San Zaccaria, Venice",
    description:
      "The Virgin and Child sit among saints in a luminous fictive chapel, an especially serene example of the sacred conversation.",
    file: "Pala di San Zaccaria (Venezia).jpg",
    shard: "d/d7",
  },
  {
    title: "Eleonora of Toledo and Her Son",
    artist: "Agnolo Bronzino",
    date: "c. 1545",
    museum: "Uffizi Galleries, Florence",
    description:
      "The Medici duchess sits with Giovanni in a state portrait whose cool poise and minutely rendered brocade project dynastic power.",
    file:
      "Bronzino - Eleonora di Toledo col figlio Giovanni - Google Art Project.jpg",
    shard: "f/f0",
  },
];

const ROTATION_SECONDS = 10 * 60;
const IMAGE_WIDTH = 1280;

export const command = "date +%s";
export const refreshFrequency = ROTATION_SECONDS * 1000;

const encodedFilename = (file) => encodeURIComponent(file.replace(/ /g, "_"));

const imageUrl = (art) => {
  const file = encodedFilename(art.file);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${art.shard}/${file}/${IMAGE_WIDTH}px-${file}`;
};

const sourceUrl = (art) =>
  `https://commons.wikimedia.org/wiki/File:${encodedFilename(art.file)}`;

const artworkFor = (output) => {
  const parsed = Number.parseInt(output, 10);
  const epochSeconds = Number.isFinite(parsed) ? parsed : Date.now() / 1000;
  const slot = Math.floor(epochSeconds / ROTATION_SECONDS);
  // Seven is coprime with sixteen, so every work appears once per cycle while
  // adjacent entries in the curated list do not necessarily appear together.
  const index = ((slot * 7) % ARTWORKS.length + ARTWORKS.length) % ARTWORKS.length;
  return { art: ARTWORKS[index], index };
};

export const render = ({ output }) => {
  const { art, index } = artworkFor(output);
  const image = imageUrl(art);

  return (
    <article className="card">
      <div className="art-stage">
        <img className="wash" src={image} aria-hidden="true" />
        <img className="art" src={image} alt={art.title} />
        <div className="image-shade" />
        <div className="eyebrow">
          <span>Renaissance Gallery</span>
          <span>{String(index + 1).padStart(2, "0")} / {ARTWORKS.length}</span>
        </div>
      </div>

      <div className="label">
        <h1>{art.title}</h1>
        <div className="maker">
          <span>{art.artist}</span>
          <i />
          <span>{art.date}</span>
        </div>
        <p>{art.description}</p>
        <a href={sourceUrl(art)} target="_blank" rel="noreferrer">
          <span>{art.museum}</span>
          <span className="source">Commons ↗</span>
        </a>
      </div>
    </article>
  );
};

export const className = `
  right: 28px;
  bottom: 28px;
  width: 334px;
  color: #f5f0e6;
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;

  * { box-sizing: border-box; }

  .card {
    width: 334px;
    overflow: hidden;
    background: rgba(18, 17, 15, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 20px;
    box-shadow:
      0 18px 55px rgba(0, 0, 0, 0.36),
      0 2px 8px rgba(0, 0, 0, 0.24);
    backdrop-filter: blur(24px) saturate(1.15);
  }

  .art-stage {
    position: relative;
    width: 100%;
    height: 228px;
    overflow: hidden;
    background: #15130f;
  }

  .wash {
    position: absolute;
    inset: -24px;
    width: calc(100% + 48px);
    height: calc(100% + 48px);
    object-fit: cover;
    filter: blur(22px) saturate(0.78) brightness(0.58);
    transform: scale(1.08);
    opacity: 0.86;
  }

  .art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 9px 10px 0;
    object-fit: contain;
    filter: saturate(0.96) contrast(1.01)
      drop-shadow(0 5px 12px rgba(0, 0, 0, 0.42));
  }

  .image-shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(5, 4, 3, 0.48) 0,
      transparent 28%,
      transparent 74%,
      rgba(10, 9, 7, 0.22) 100%
    );
    pointer-events: none;
  }

  .eyebrow {
    position: absolute;
    top: 13px;
    left: 15px;
    right: 15px;
    display: flex;
    justify-content: space-between;
    color: rgba(255, 252, 245, 0.9);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.17em;
    line-height: 1;
    text-transform: uppercase;
    text-shadow: 0 1px 5px rgba(0, 0, 0, 0.8);
  }

  .label {
    min-height: 166px;
    padding: 15px 17px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(135deg, rgba(255, 252, 242, 0.055), transparent 55%),
      rgba(15, 14, 12, 0.72);
  }

  h1 {
    margin: 0;
    color: #fffaf0;
    font-family: "New York", "Iowan Old Style", Baskerville, Georgia, serif;
    font-size: 19px;
    font-weight: 560;
    letter-spacing: -0.012em;
    line-height: 1.12;
  }

  .maker {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
    color: #c8bda9;
    font-family: "New York", "Iowan Old Style", Baskerville, Georgia, serif;
    font-size: 11.5px;
    font-style: italic;
    line-height: 1.25;
  }

  .maker i {
    width: 3px;
    height: 3px;
    background: #9e8a68;
    border-radius: 50%;
    opacity: 0.75;
  }

  p {
    min-height: 42px;
    margin: 9px 0 10px;
    color: rgba(245, 240, 230, 0.84);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.006em;
    line-height: 1.38;
  }

  a {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding-top: 9px;
    border-top: 1px solid rgba(255, 255, 255, 0.09);
    color: rgba(201, 191, 172, 0.72);
    font-size: 8.5px;
    font-weight: 550;
    letter-spacing: 0.055em;
    line-height: 1.2;
    text-decoration: none;
    text-transform: uppercase;
  }

  a span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source {
    flex: none;
    color: rgba(201, 191, 172, 0.5);
  }
`;
