const sheet = { width: 1120, height: 792, margin: 32, gap: 15, scale: 2.5 };
const ink = '#163644', muted = '#476371', rule = '#b9cdd2';
const tileIds = ['hub', 'crew', 'travel', 'people', 'finance', 'admin'];
const branchColors = ['#167b81', '#426d9a', '#987125', '#446e61', '#6f6288'];
const font = (size, weight = 400) => weight + ' ' + size + 'px Arial, "Leelawadee UI", Tahoma, sans-serif';

function textLines(ctx, value, face, width) {
  ctx.font = face;
  const words = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('th', { granularity: 'word' }).segment(value), item => item.segment)
    : value.match(/\S+\s*|\s+/g) || [];
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && ctx.measureText(line + word.trimEnd()).width > width) {
      lines.push(line.trimEnd());
      line = '';
    }
    line += line ? word : word.trimStart();
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

function writeLines(ctx, lines, x, y, width, step, face, color, align = 'left') {
  ctx.font = face;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * step, width));
}

function box(ctx, x, y, width, height, radius, fill, border) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.stroke();
  }
}

async function illustrationTiles(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const width = image.naturalWidth / 3, height = image.naturalHeight / 2;
  return new Map(tileIds.map((name, index) => {
    const tile = document.createElement('canvas');
    tile.width = width;
    tile.height = height;
    tile.getContext('2d').drawImage(image, index % 3 * width, Math.floor(index / 3) * height,
      width, height, 0, 0, width, height);
    return [name, tile];
  }));
}

export async function createHandoverMapPdf(root, artwork) {
  const exporter = window.HarborFlowVectorPdf;
  if (!exporter?.fromCanvases) throw Error('PDF exporter unavailable');
  await document.fonts.ready;
  const tiles = await illustrationTiles(artwork);
  const read = (node, selector) => node.querySelector(selector)?.textContent.trim() || '';
  const name = read(root, '.hfm-hub h3'), summary = read(root, '.hfm-hub p');
  const groups = [...root.querySelectorAll('.hfm-branch')].map((branch, index) => ({
    name: read(branch, 'h4'),
    tile: tiles.get(branch.querySelector('[data-hfm-art]').dataset.hfmArt),
    color: branchColors[index % branchColors.length],
    topics: [...branch.querySelectorAll('.hfm-topic')].map(topic => ({
      name: read(topic, '.hfm-topic-label > span'),
      description: read(topic, '.hfm-topic-label > small')
    }))
  }));

  const { width, height, margin, gap, scale } = sheet;
  const pages = [];
  for (let start = 0; start < groups.length; start += 5) {
    let pending = groups.slice(start, start + 5);
    while (pending.length) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = exporter.captureContext(canvas);
      ctx.scale(scale, scale);
      ctx.lineWidth = 1;
      ctx.textBaseline = 'alphabetic';

      const columnWidth = Math.min(310, (width - 2 * margin - (pending.length - 1) * gap) / pending.length);
      const groupLeft = (width - pending.length * columnWidth - (pending.length - 1) * gap) / 2;
      const hubWidth = 420;
      const hubText = textLines(ctx, name, font(27, 700), hubWidth - 116);
      const hubHeight = Math.max(104, 49 + hubText.length * 31);
      const trunk = hubHeight + 32, portraits = trunk + 18, headings = portraits + 112;
      const limit = height - 2 * margin;
      const columns = pending.map((group, column) => ({
        ...group,
        x: groupLeft + column * (columnWidth + gap),
        title: textLines(ctx, group.name, font(16, 700), columnWidth - 6),
        placed: []
      }));
      const startY = headings + 14 + Math.max(...columns.map(column => column.title.length)) * 20;
      for (const column of columns) {
        let y = startY;
        for (const topic of column.topics) {
          const title = textLines(ctx, topic.name, font(15, 700), columnWidth - 36);
          const description = textLines(ctx, topic.description, font(13), columnWidth - 36);
          const h = Math.max(43, 17 + title.length * 18 + description.length * 16);
          if (column.placed.length && y + h > limit) break;
          column.placed.push({ title, description, y, h });
          y += h + 7;
        }
      }
      const contentHeight = Math.max(...columns.map(column => {
        const last = column.placed.at(-1);
        return last.y + last.h;
      }));
      const top = Math.max(margin, (height - contentHeight) / 2), middle = width / 2;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      box(ctx, middle - hubWidth / 2, top, hubWidth, hubHeight, 15, '#e9f3f4');
      ctx.drawImage(tiles.get('hub'), middle - hubWidth / 2 + 10, top + (hubHeight - 84) / 2, 84, 84);
      const hubBaseline = top + (hubHeight - hubText.length * 31 - 16) / 2 + 22;
      writeLines(ctx, hubText, middle - hubWidth / 2 + 109, hubBaseline, hubWidth - 116, 31, font(27, 700), ink);
      writeLines(ctx, [summary], middle - hubWidth / 2 + 109, hubBaseline + hubText.length * 31 - 4,
        hubWidth - 116, 18, font(14), muted);

      ctx.strokeStyle = rule;
      ctx.beginPath();
      ctx.moveTo(middle, top + hubHeight);
      ctx.lineTo(middle, top + trunk);
      ctx.moveTo(columns[0].x + columnWidth / 2, top + trunk);
      ctx.lineTo(columns.at(-1).x + columnWidth / 2, top + trunk);
      for (const column of columns) {
        const center = column.x + columnWidth / 2;
        ctx.moveTo(center, top + trunk);
        ctx.lineTo(center, top + portraits);
      }
      ctx.stroke();
      for (const column of columns) {
        const center = column.x + columnWidth / 2;
        ctx.drawImage(column.tile, center - 45, top + portraits, 90, 90);
        writeLines(ctx, column.title, center, top + headings, columnWidth - 6, 20, font(16, 700), ink, 'center');
        const last = column.placed.at(-1);
        ctx.fillStyle = rule;
        ctx.fillRect(column.x + 3, top + startY, 1, last.y + last.h - startY);
        for (const topic of column.placed) {
          const y = top + topic.y;
          box(ctx, column.x + 13, y, columnWidth - 13, topic.h, 8, '#f8fbfc', rule);
          ctx.fillStyle = column.color;
          ctx.beginPath();
          ctx.arc(column.x + 3, y + topic.h / 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
          writeLines(ctx, topic.title, column.x + 23, y + 19, columnWidth - 35, 18, font(15, 700), ink);
          writeLines(ctx, topic.description, column.x + 23, y + 17 + topic.title.length * 18,
            columnWidth - 35, 16, font(13), muted);
        }
      }
      pages.push(canvas);
      pending = columns.map(column => ({ ...column, topics: column.topics.slice(column.placed.length) }))
        .filter(column => column.topics.length);
    }
  }
  return exporter.fromCanvases(pages, { width: 841.89, height: 595.28 });
}
