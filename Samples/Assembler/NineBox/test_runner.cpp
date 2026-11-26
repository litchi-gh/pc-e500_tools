// Tests run the workspace's actual SC62015/HD61102 emulator, not a game port.
#include "machine.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <sstream>
#include <vector>
namespace fs=std::filesystem;
using Bytes=std::vector<BYTE>;
std::map<std::string,unsigned> syms;
int checks=0;
Bytes raw,rom;
void check(bool b,const std::string& msg){++checks;if(!b)throw std::runtime_error(msg);}
Bytes read(const fs::path& p){
    std::ifstream f(p,std::ios::binary);if(!f)throw std::runtime_error("open: "+p.string());
    return {std::istreambuf_iterator<char>(f),{}};
}
const unsigned ORG=0xBD000,STOP=0xBC000; // the program, and a return address nothing is at
fs::path build;                          // NINEBOX.RAW and NINEBOX.SYM of this run
// A .lcd file (the controllers' display RAM) as 240x32 dots.
Bytes picture(const std::string& name){
    auto f=read(fs::path("assets")/(name+".lcd"));
    check(f.size()==1024,"1024 bytes: "+name);
    Bytes p(7680);
    for(int y=0;y<32;y++)for(int x=0;x<240;x++){
        int c=x<64||x>=176,col=x<64?x:x<120?x-64:x<176?175-x:239-x,row=y+(x>=120?32:0);
        p[y*240+x]=f[c*512+row/8*64+col]>>(row%8)&1;
    }
    return p;
}
unsigned sym(const std::string& n){return syms.at(n);}
BYTE& v(Machine& m,const std::string& n){return m.cpu.imem[sym(n)];}
void step(Machine& m){m.step();if(m.cpu.fault)throw std::runtime_error("CPU fault at "+std::to_string(m.cpu.reg.x.p));}
void run(Machine& m,uint64_t cycles){
    auto target=m.cpu.cycles+cycles;
    while(m.cpu.cycles<target)step(m);
    m.audio.clear();
}
void until(Machine& m,unsigned pc,uint64_t budget=4000000){
    auto end=m.cpu.cycles+budget;
    while(m.cpu.reg.x.p!=pc && m.cpu.cycles<end)step(m);
    check(m.cpu.reg.x.p==pc,"timeout: target "+std::to_string(pc)+" actual "+std::to_string(m.cpu.reg.x.p));
    m.audio.clear();
}
Bytes pixels(Machine& m){Bytes b(7680);m.pixels(b.data());return b;}
void capture(Machine& m,const std::string& name){
    fs::create_directories("screenshots");auto b=pixels(m);
    std::ofstream f(fs::path("screenshots")/(name+".pixels"),std::ios::binary);
    f.write((const char*)b.data(),b.size());
}
std::unique_ptr<Machine> fresh(bool direct=true){
    auto m=std::make_unique<Machine>();
    std::copy(rom.begin(),rom.end(),m->mem.begin()+0xC0000);m->cpu.Reset();
    if(direct){
        for(unsigned i=0;i<raw.size();i++)m->Set_8(ORG+i,raw[i]);
        m->cpu.set_reg(REG_U,0xBFBF0);m->cpu.set_reg(REG_S,0xBFB00);
        m->cpu.imem[IMEM_IMR]=0;
        m->cpu.imem[IMEM_SCR]=0x33; // deliberately simulate an active ROM tone
        m->cpu.set_reg(REG_P,ORG);
        until(*m,sym("frame_ready"));
        until(*m,sym("main_loop"));
    }
    return m;
}
// Execute a near subroutine through real CALL/RET stack semantics; return to
// the main loop, never into a partially executed renderer with clobbered regs.
void call(Machine& m,const std::string& n,uint64_t budget=4000000){
    until(m,sym("main_loop"));
    auto pc=m.cpu.reg.x.p;auto sp=m.cpu.reg.x.s;
    m.cpu.reg.x.s-=2;m.Set_16(m.cpu.reg.x.s,STOP&0xFFFF);
    m.cpu.reg.x.p=sym(n);until(m,STOP,budget);
    check(m.cpu.reg.x.s==sp,"unbalanced S stack in "+n);
    m.cpu.reg.x.p=pc;
}
void key(Machine& m,int row,int bit,int down=70000,int up=150000){
    m.keys[row]|=1<<bit;run(m,down);
    m.keys[row]&=BYTE(~(1<<bit));run(m,up);
}
void plot(Bytes& p,int x,int y){
    check(x>=0&&x<240&&y>=0&&y<32,"reference pixel bounds");p[y*240+x]=1;
}
void square(Bytes& p,int x,int y){
    for(int j=0;j<2;j++)for(int i=0;i<2;i++)plot(p,x+i,y+j);
}
void number(Bytes& p,int value,int count,int x,int y){
    // Independent row-oriented reference digits (runtime uses column bytes).
    const char* rows[]={"111101101101111","010110010010111","110001010100111",
    "110001010001110","101101111001001","111100110001110","011100111101111",
    "111001010010010","111101111101111","111101111001110"};
    std::string s=std::to_string(value);s=std::string(count-s.size(),'0')+s;
    for(char c:s){for(int j=0;j<5;j++)for(int i=0;i<3;i++)
        if(rows[c-'0'][j*3+i]=='1')plot(p,x+i,y+j);x+=4;}
}
void digits(Machine& m,const std::string& n,int count,int value){
    for(int i=0;i<count;i++){m.cpu.imem[sym(n)+i]=value%10;value/=10;}
}
int value(Machine& m,const std::string& n,int count){
    int v=0;for(int i=count-1;i>=0;i--)v=v*10+m.cpu.imem[sym(n)+i];return v;
}
void shape(Bytes& p,Machine& m,int type,int rotation,int cx,int cy,bool preview){
    unsigned a=sym("shapes")+type*24+rotation*6;
    for(int i=0;i<3;i++){
        int x=m.Get_8(a+i*2),y=m.Get_8(a+i*2+1);
        if(preview)square(p,130+3*y,14+3*x);
        else square(p,62+3*(cy+y),3+3*(cx+x));
    }
}
void expect_screen(Machine& m,const std::string& bg,bool active){
    Bytes expected=picture(bg);
    for(int y=0;y<18;y++)for(int x=0;x<9;x++)
        if(m.Get_8(sym("board")+y*9+x))square(expected,62+3*y,3+3*x);
    if(active)shape(expected,m,v(m,"piece"),v(m,"piece_rot"),v(m,"piece_x"),v(m,"piece_y"),false);
    shape(expected,m,v(m,"next_piece"),0,0,0,true);
    number(expected,value(m,"score_digits",6),6,26,11);
    number(expected,value(m,"box_digits",3),3,26,18);
    number(expected,value(m,"level_digits",2),2,26,25);
    auto actual=pixels(m);int count=0,first=-1;
    for(int i=0;i<7680;i++)if(expected[i]!=actual[i]){count++;if(first<0)first=i;}
    check(count==0,"pixel mismatch "+bg+": "+std::to_string(count)+" first x,y="+
          std::to_string(first%240)+","+std::to_string(first/240));
}
void direct_tests(){
    auto h=fresh();auto& m=*h;
    check(pixels(m)==picture("title"),"title must match all 7680 pixels");
    check((m.cpu.imem[IMEM_SCR]&0x70)==0,"silence inherited tone");
    capture(m,"01-title");
    key(m,2,6); // SPACE
    check(v(m,"mode")==1,"SPACE starts from title");
    call(m,"render");expect_screen(m,"game",true);capture(m,"02-start");

    auto y=v(m,"piece_y");run(m,850000);
    check(v(m,"piece_y")>y,"64 Hz gravity");
    auto x=v(m,"piece_x");key(m,3,6);check(v(m,"piece_x")==x-1,"UP moves lane up");
    key(m,2,7);check(v(m,"piece_x")==x,"DOWN moves lane down");
    auto rot=v(m,"piece_rot");key(m,1,4);
    check(v(m,"piece_rot")==((rot+3)&3),"X rotates clockwise on screen");
    key(m,0,5);check(v(m,"piece_rot")==rot,"Z rotates counterclockwise");

    key(m,10,0);check(v(m,"mode")==2,"P pauses");
    auto held=v(m,"piece_y");run(m,1500000);check(v(m,"piece_y")==held,"pause freezes gravity");
    call(m,"render");expect_screen(m,"paused",true);capture(m,"04-pause");
    key(m,10,0);check(v(m,"mode")==1,"P resumes");

    // Lock by physical SPACE key; board must gain exactly its cells.
    std::map<std::pair<int,int>,int> cells;
    for(int i=0;i<3;i++){unsigned a=sym("shapes")+v(m,"piece")*24+v(m,"piece_rot")*6+i*2;cells[{m.Get_8(a),m.Get_8(a+1)}]=1;}
    key(m,2,6);int occupied=0;
    until(m,sym("main_loop"));
    for(int i=0;i<162;i++){auto b=m.Get_8(sym("board")+i);check(b<=5,"board value 0..5");occupied+=b!=0;}
    check(occupied==(int)cells.size(),"hard drop locks the cells of the piece");
    check(value(m,"score_digits",6)>0,"hard drop awards decimal points");

    // Full board exercises every cell, both halves of C0 and 8-dot page seams.
    v(m,"mode")=3;
    for(int i=0;i<162;i++)m.Set_8(sym("board")+i,i%5+1);
    digits(m,"score_digits",6,123456);digits(m,"box_digits",3,128);digits(m,"level_digits",2,9);
    call(m,"render");expect_screen(m,"over",false);

    // A reproducible, mixed-height gameplay scene for visual review.
    const int heights[9]={5,2,3,2,1,0,2,4,1};
    for(int lane=0;lane<9;lane++)for(int depth=0;depth<18;depth++)
        m.Set_8(sym("board")+depth*9+lane,depth>=18-heights[lane]&&(depth+lane)%5!=4?lane%5+1:0);
    v(m,"mode")=1;v(m,"piece")=4;v(m,"piece_rot")=0;v(m,"piece_x")=3;v(m,"piece_y")=8;
    v(m,"next_piece")=3;
    digits(m,"score_digits",6,12450);digits(m,"box_digits",3,18);digits(m,"level_digits",2,2);
    call(m,"render");expect_screen(m,"game",true);capture(m,"03-game");
    v(m,"mode")=2;call(m,"render");expect_screen(m,"paused",true);capture(m,"04-pause");
    v(m,"mode")=3;call(m,"render");expect_screen(m,"over",false);capture(m,"05-game-over");

    // Actual boxes: three lanes six deep are two boxes, one after the other.
    call(m,"new_game");
    for(int depth=12;depth<18;depth++)for(int lane=3;lane<6;lane++)m.Set_8(sym("board")+depth*9+lane,1);
    m.Set_8(sym("board")+11*9+4,2);m.Set_8(sym("board")+11*9+6,3);
    call(m,"clear_boxes");
    check(v(m,"chain")==2,"two boxes");
    check(value(m,"box_digits",3)==2,"two-box counter");
    check(value(m,"score_digits",6)==270,"two-box score 90+180");
    for(int i=0;i<162;i++){
        int want=i==17*9+4?2:i==11*9+6?3:0;
        check(m.Get_8(sym("board")+i)==want,"what is before the boxes goes deeper, other lanes stay");
    }
    call(m,"render");expect_screen(m,"game",true);capture(m,"06-two-boxes");
    // A box made by the move: it goes in the same drop.
    call(m,"new_game");
    for(int depth=15;depth<18;depth++)for(int lane=0;lane<3;lane++)m.Set_8(sym("board")+depth*9+lane,1);
    for(int depth=12;depth<15;depth++)for(int lane=2;lane<3;lane++)m.Set_8(sym("board")+depth*9+lane,2);
    for(int depth=15;depth<18;depth++)for(int lane=3;lane<5;lane++)m.Set_8(sym("board")+depth*9+lane,3);
    call(m,"clear_boxes");
    check(v(m,"chain")==2&&value(m,"score_digits",6)==270,"chain");
    for(int i=0;i<162;i++)check(m.Get_8(sym("board")+i)==0,"chain leaves nothing");
    // In every place of the field.
    for(int depth=0;depth<=15;depth++)for(int lane=0;lane<=6;lane++){
        call(m,"new_game");
        for(int i=0;i<9;i++)m.Set_8(sym("board")+(depth+i/3)*9+lane+i%3,1);
        call(m,"clear_boxes");
        check(v(m,"chain")==1,"box in every place");
        for(int i=0;i<162;i++)check(m.Get_8(sym("board")+i)==0,"box leaves nothing");
    }

    digits(m,"score_digits",6,999998);m.cpu.reg.x.i=9;call(m,"add_points");
    check(value(m,"score_digits",6)==999999,"score saturation");
    call(m,"new_game");for(int i=0;i<10;i++)call(m,"count_box");
    check(v(m,"level")==2&&v(m,"drop_ticks")==36,"level increases every ten boxes");

    // New bag contains all five pieces exactly once.
    v(m,"bag_used")=0;unsigned bag=0;
    for(int i=0;i<5;i++){call(m,"pick_next");bag|=1<<v(m,"next_piece");}
    check(bag==31,"five-piece bag");
    // Screen clipping must never write outside the framebuffers.
    Bytes before(m.mem.begin(),m.mem.end());
    v(m,"draw_x")=255;v(m,"draw_y")=0;call(m,"set_pixel");
    for(unsigned a=0xB8000;a<0xBF000;a++)
        check(m.mem[a]==before[a],"clipping cannot write outside screen");
    for(unsigned i=0;i<sym("code_end")-ORG;i++)
        check(m.Get_8(ORG+i)==raw[i],"game must not overwrite code/assets");
}

void continuous_tests(){
    auto h=fresh();auto& m=*h;
    key(m,2,6);int retries=0;
    for(int i=0;i<120;i++){
        if(v(m,"mode")==3){key(m,2,6);retries++;}
        if(i%3==0)key(m,3,6,160000,30000);
        if(i%3==1)key(m,2,7,160000,30000);
        if(i%2==0)key(m,1,4,40000,40000);
        if(i%5==0)key(m,0,5,40000,40000);
        key(m,2,6,40000,100000);
        until(m,sym("main_loop"));
        if(v(m,"dirty"))until(m,sym("frame_ready"));
        expect_screen(m,v(m,"mode")==3?"over":"game",v(m,"mode")!=3);
        check((m.cpu.imem[IMEM_SCR]&0x70)==0,"continuous play remains silent");
        for(int j=0;j<162;j++)check(m.Get_8(sym("board")+j)<=5,"continuous board bounds");
    }
    check(retries>0,"natural game over and SPACE retry");
    for(unsigned i=0;i<sym("code_end")-ORG;i++)
        check(m.Get_8(ORG+i)==raw[i],"continuous play preserves code and assets");
    capture(m,"10-continuous-play");
    std::cout<<"PASS 120 physical-key drop cycles, "<<retries<<" game-over retries\n";
}

// Real ROM keyboard input, including shifted quotes and colon for LOAD M.
const char* matrix[]={"TEXT Q MENU A BASIC Z SHIFT CTRL","W E S D X C CAPS KANA",
"R T F G V B SPACE DOWN","Y U H J N M UP LEFT","I O K L , ; RIGHT ENTER",
"RCL HYP HEX EXP 7 4 1 0","STO SIN DEG ^ 8 5 2 +/-","C-CE COS LN SQRT 9 6 3 .",
"STAT TAN LOG SQUARE / * - +",") FSE INV ( DEL BS INS =","P 2ndF F5 F4 F3 F2 F1","OFF ON/BRK"};
std::map<std::string,std::pair<int,int>> keys;
void rom_key(Machine& m,const std::string& s){auto [r,b]=keys.at(s);key(m,r,b,150000,180000);}
void type(Machine& m,const std::string& s){
    for(char c:s){
        if(c=='"'||c==':'||c=='&'){
            m.keys[0]|=64;run(m,20000);rom_key(m,c=='"'?"W":c=='&'?"Y":";");m.keys[0]&=~64;run(m,20000);
        }else rom_key(m,c==' '?"SPACE":std::string(1,c));
    }
    rom_key(m,"ENTER");run(m,1024000);
}
void rom_tests(){
    auto h=fresh(false);auto& m=*h;
    check(m.disk.mount(fs::absolute(".").wstring().c_str(),true),"mount NINEBOX directory read-only");
    run(m,1024000);rom_key(m,"F1");run(m,1024000);rom_key(m,"BASIC");run(m,1024000);
    // The machine-code area, as "Make BIN" says. It goes to the main menu.
    type(m,"POKE &HBFE03,&H1A,&HFD,&H0B,&H00,&H2C,&H00:CALL &HFFFD8");run(m,2048000);
    check(m.Get_16(0xBFD1A)==(ORG&0xFFFF),"machine-code area starts at ORG");
    rom_key(m,"BASIC");run(m,1024000);
    type(m,"LOAD M \"X:NINEBOX.BIN\"");run(m,20000000);
    for(unsigned i=0;i<raw.size();i++)check(m.Get_8(ORG+i)==raw[i],"ROM LOAD M byte "+std::to_string(i));
    type(m,"CALL 774144");
    check(m.cpu.reg.x.p>=ORG&&m.cpu.reg.x.p<sym("code_end"),"ROM CALL enters game");
    check(v(m,"mode")==0,"ROM CALL reaches title");
    check(pixels(m)==picture("title"),"ROM-loaded title pixel equality");
    capture(m,"07-rom-load-title");
    key(m,2,6,100000,300000);
    check(v(m,"mode")==1,"ROM-loaded game starts");
    // Capture a completed frame without altering PC/state.
    until(m,sym("frame_ready"));capture(m,"08-rom-game");
    key(m,11,1,100000,1000000); // ON/BRK press and release
    check(m.cpu.reg.x.p>=0xC0000,"RETF returns to ROM");
    check((m.cpu.imem[IMEM_SCR]&0x70)==0,"return stays silent");
    type(m,"1+2");capture(m,"09-rom-return");
    check(m.cpu.reg.x.p>=0xC0000,"ROM remains responsive after exit");
    // A second CALL must restore a clean title and respond again.
    type(m,"CALL 774144");
    check(v(m,"mode")==0&&pixels(m)==picture("title"),"second CALL title");
    key(m,11,1,100000,1000000);
}
int main(int argc,char** argv)try{
    if(argc<3)throw std::runtime_error("test_runner <build folder> <ROM>");
    build=argv[1];
    std::ifstream f(build/"NINEBOX.SYM");std::string n,e,a;
    while(f>>n>>e>>a)syms[n]=unsigned(std::stoul(a.substr(1),nullptr,16));
    for(int r=0;r<12;r++){std::istringstream s(matrix[r]);int b=0;while(s>>n)keys[n]={r,b++};}
    raw=read(build/"NINEBOX.RAW");rom=read(argv[2]);
    auto bin=read("NINEBOX.BIN");
    check(bin.size()==raw.size()+16&&raw.size()<32768,"header and stock RAM size");
    check(std::equal(raw.begin(),raw.end(),bin.begin()+16),"BIN payload: make NINEBOX.BIN again");
    direct_tests();std::cout<<"PASS pixel reference + gameplay tests\n"<<std::flush;
    continuous_tests();
    rom_tests();
    std::cout<<"PASS "<<checks<<" checks; ROM LOAD M/CALL/exit/re-entry, silence, all 7680 pixels, gameplay\n";
    return 0;
}catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<"\n";return 1;}
