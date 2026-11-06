import GdkPixbuf from 'gi://GdkPixbuf';
const [dir, out] = ARGV;
const fams = ['xbox', 'playstation', 'nintendo'];
const keys = ['a','b','x','y','lb','rb','lt','rt','back','start','guide','dpad','left-stick','right-stick','l3','r3'];
const S = 3, cell = 60 * S;
const sheet = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, keys.length * cell, fams.length * cell);
sheet.fill(0x202024ff);
fams.forEach((f, r) => keys.forEach((k, c) => {
  const pb = GdkPixbuf.Pixbuf.new_from_file_at_scale(`${dir}/${f}/${k}.svg`, -1, 32 * S, true);
  const x = c * cell + Math.floor((cell - pb.get_width()) / 2), y = r * cell + Math.floor((cell - pb.get_height()) / 2);
  pb.composite(sheet, x, y, pb.get_width(), pb.get_height(), x, y, 1, 1, GdkPixbuf.InterpType.BILINEAR, 255);
}));
sheet.savev(out, 'png', [], []);
