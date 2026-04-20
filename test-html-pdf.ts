import pdf from 'html-pdf';
import fs from 'fs';
import path from 'path';

pdf.create('<h1>Hello World</h1>').toFile(path.join(process.cwd(), 'test-html.pdf'), (err, res) => {
    if (err) return console.log(err);
    console.log(res);
});
