export function pageFit(sourceWidth,sourceHeight,width,height,preserveAspectRatio){
  if(![sourceWidth,sourceHeight,width,height].every(n=>Number.isFinite(n)&&n>0))throw new Error('Invalid PDF page dimensions');
  const sx=preserveAspectRatio?Math.min(width/sourceWidth,height/sourceHeight):width/sourceWidth;
  const sy=preserveAspectRatio?sx:height/sourceHeight;
  return {sx,sy,x:preserveAspectRatio?(width-sourceWidth*sx)/2:0,y:preserveAspectRatio?(height-sourceHeight*sy)/2:0};
}
