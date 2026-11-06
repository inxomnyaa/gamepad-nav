// gjs -m render-svg.js in.svg out.png width [height]
import GdkPixbuf from 'gi://GdkPixbuf';
const [inp, out, w, h] = ARGV;
GdkPixbuf.Pixbuf.new_from_file_at_scale(inp, +w, h ? +h : -1, !h).savev(out, 'png', [], []);
