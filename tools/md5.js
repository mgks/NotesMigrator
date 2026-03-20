export function md5(data) {
    if(typeof data==='string'){
        const buf=new Uint8Array(data.length);
        for(let i=0;i<data.length;i++)buf[i]=data.charCodeAt(i);
        data=buf;
    }
    var hm=function(k){return k<<24|k>>>8&0xff00|k<<8&0xff0000|k>>>24};
    var words=[];
    for(var i=0;i<data.length;i+=4){
        words.push(data[i]|data[i+1]<<8|data[i+2]<<16|data[i+3]<<24);
    }
    var len=data.length*8;
    words[len>>5]|=0x80<<(len%32);
    words[(((len+64)>>>9)<<4)+14]=len;
    
    var h0=1732584193; var h1=-271733879; var h2=-1732584194; var h3=271733878;
    for(var i=0;i<words.length;i+=16){
        var a=h0,b=h1,c=h2,d=h3;
        for(var j=0;j<64;j++){
            var f,g;
            if(j<16){
                f=(b&c)|((~b)&d);
                g=j;
            }else if(j<32){
                f=(d&b)|((~d)&c);
                g=(5*j+1)%16;
            }else if(j<48){
                f=b^c^d;
                g=(3*j+5)%16;
            }else{
                f=c^(b|(~d));
                g=(7*j)%16;
            }
            var temp=d;
            d=c;
            c=b;
            var w=words[i+g];
            // ... wait, I should just use `npm i spark-md5` or something?
        }
    }
}
