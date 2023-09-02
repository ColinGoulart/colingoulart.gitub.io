

var canvas=document.getElementById("canvas");
var ctx=canvas.getContext("2d");

canvas.width = screen.width*.7;
canvas.height = screen.height*.7;


var width = canvas.width;
var height = canvas.height;
var pixel_buffer = new Array(width*height);

var WireFrameView = false;

//performance
var frames = 0;
var ticks = 0;
var delta = 0;
var fps = 1000/60;
var lastTime = Date.now();
var lastFPSReq = Date.now();
var updated_ticks = 0;
var updated_frames = 0;

//math
var cos = Math.cos;
var sin = Math.sin;
var abs = Math.abs;
var pi = Math.PI;

var max = Math.max;
var min = Math.min;

var tan = Math.tan;
var floor = Math.floor;
var pow = Math.pow;

//storage
var keys = new Array(120);
var entities = [];

//cmd prompt
var cmd_prmpt_enabled = false;
var cmd_prmpt = "";


//inputs
var delta_x = 0;
var delta_y = 0;
var mouse_sensitivity = .1;
var mouse_down = false;
var focused = false;
var running = true;

var m_x = 0;
var m_y = 0;

var last_x = 0;
var last_y = 0;

var a = 0;
var cam_spd = 15;
var client_x = 0;
var client_y = 0;
var y_rot_bound = 90;
var tris_queue = [];


//camera_settings
var fov = 90;
var aspect_ratio = canvas.height/canvas.width;
var znear = 0;
var zfar = 10;

var bg_col = 0x000000;

ctx.fillStyle="black";
ctx.fillRect(0,0,canvas.width,canvas.height);

ctx.fillStyle="white";
ctx.font = "20px Arial";
var error_text = `VOID`;
ctx.fillText(error_text, canvas.width/2-(error_text.length*(15/5)), canvas.height/2);

var imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
var map_data = imgData.data;

function lerp(a,b,t){ 
  return a+(b-a)*t; 
}
function rgb_r(col){return (col>>16)&0xFF}
function rgb_g(col){return (col>>8)&0xFF}
function rgb_b(col){return (col)&0xFF}

function hex_r(col){return (col<<16)}
function hex_g(col){return (col<<8)}

var cam = new mat4(new vec3(0,0,0));

cam.right_vec = new vec3(1,0,0);
cam.up_vec = new vec3(0,1,0); 
cam.foward_vec = new vec3(0,0,1);

function array_to_vec3(arr){
  return new vec3(arr[0],arr[1],arr[2]);
}
function vec3_to_array(vec3){
  return [vec3.x,vec3.y,vec3.z];
}

//ccw scheme

var plr_pos = new vec3(0,0,0);
var gravity = new vec3(0,9,0);
var velocity = new vec3(0,0,0);


function rad(deg){return deg*pi/180}
function deg(rad){return rad*180/pi}


function insertEntity(type,mat4,tris){
    var entity = new Cube(mat4);

    switch(type){
      case "Cube":
        entity = new Cube(mat4);
      break;
      case "Pyramid":
        entity = new Pyramid(mat4); 
      break;
	  case "Custom": 
		entity = new Custom(mat4);
		entity.tris = tris;
	  break;
    }

    entities.push(entity);
    return entity;
}


function randomRange(range){
    return -range+Math.random()*(range*2);
}


for(var i=0; i<5; i++){
	insertEntity("Pyramid", new mat4(new vec3(0,1.5+i*1.1,2.5)))
}
//var player_cube = insertEntity("Cube",new mat4(plr_pos));


///////////// 3D RENDERING ///////////////

function apply_pers(vertex){

  if(!vertex) return;    
 
  var x = vertex[0];
  var y = vertex[1];
  var z = vertex[2];
  
  var f = 1/tan(rad(fov)/2);

  var h = zfar/(zfar-znear);
  var nz = abs(z*h-h*znear);

  return new vec3(
          aspect_ratio*f*x/(nz==0?1:nz),
          f*y/(nz==0?1:nz),
          z
         );
}

function apply_cam(vertex){ 

  var x = vertex[0];
  var y = vertex[1];
  var z = vertex[2];
  
  var v = new vec3(x,y,z);
  
  var i = cam.right_vec;
  var j = cam.up_vec;
  var k = cam.foward_vec;
  
  var cam_rel = v.sub(cam.pos);
  
  var d1 = i.dot(cam_rel);
  var d2 = j.dot(cam_rel);
  var d3 = k.dot(cam_rel);

  return [d1,d2,d3];
}

function transform(tri,mat4){
  var x = tri[0]*mat4.m00+tri[1]*mat4.m01+tri[2]*mat4.m02+mat4.pos.x;
  var y = tri[0]*mat4.m10+tri[1]*mat4.m11+tri[2]*mat4.m12+mat4.pos.y;
  var z = tri[0]*mat4.m20+tri[1]*mat4.m21+tri[2]*mat4.m22+mat4.pos.z;
  return [x,y,z];
}


function getPointInBounds(px,py,s){

    var nx=px;
    var ny=py;
    var w = width;
    var h = height;

    var min_x = (-py)/s+px;
    var max_x = (h-py)/s+px;

    var min_y = -px*s+py;
    var max_y = s*(w-px)+py;

    if(py<0){
      ny=0;
      if(min_x>w){
        nx=w;
        ny=max_y;
      }else if(min_x<0){
        nx=0;
        ny=min_y;
      }else{
        nx=min_x;
      }
    }else if(py>h){
      ny=h;
      nx=max_x;
    }

    if(nx<0){
      nx=0;
      ny=min_y;
    }else if(nx>w){
      nx=w;
      ny=max_y;
    }

    return {x: nx, y: ny};
}

var biggest_line = Math.sqrt(width*width+height*height);


function scale_transform_y(y){
    return -y*height+height/2;
}
function scale_transform_x(x){
    return x*width+width/2;
}

function squash_x(x){
    return (x-width/2)/width;
}

function squash_y(y){
    return -(y-height/2)/height;
}

function createVisualPoint(point,thickness,col){

	for(var i=0; i<thickness*thickness; i++){
	
		var x=i%thickness;
		var y=floor(i/thickness);
	
		setPixel(point.x-(floor(thickness/2))+x, point.y-(floor(thickness/2))+y, col);
	}
}

function drawLine(v0,v1,v2,rasterize){
    
    var scale_x = canvas.width;
    var scale_y = canvas.height;

    var x1 = scale_transform_x(v0.x);
    var y1 = scale_transform_y(v0.y);

    var x2 = scale_transform_x(v1.x);
    var y2 = scale_transform_y(v1.y);

    //line adjustment
    var dx = x2-x1;
    var dy = y2-y1;
    var s =  dy/dx;

	//gets points when line intersects screen boundaries
    var fixed_p1 = getPointInBounds(x1,y1,s); 
    var fixed_p2 = getPointInBounds(x2,y2,s);

    var nx = fixed_p2.x-fixed_p1.x;
    var ny = fixed_p2.y-fixed_p1.y;

    var mag = floor(Math.min(Math.sqrt(nx*nx+ny*ny), biggest_line)+.5); //in case all hell breaks loose I implemented a min mag.

    var unit_x = nx/mag;
    var unit_y = ny/mag;
	
	//5x5 points - 5 thickness (nxn points - n thickness)

    for(var i=0; i<mag; i+=.5){

        if(v0.z < 0 && v1.z < 0) break;

        var x = fixed_p1.x+(unit_x*i); 
        var y = fixed_p1.y+(unit_y*i);

        if(!rasterize){
          setPixel(x,y);
        }else{
          rasterPixel(x,y,v0,v1,v2);
        }
    }
}

function getLowPointTri(p1,p2,p3){
    var lowest = .5;
    if(p1.y<lowest) lowest=p1.y;
    if(p2.y<lowest) lowest=p2.y;
    if(p3.y<lowest) lowest=p3.y;
    return lowest;
  }

function getHighPointTri(p1,p2,p3){
    var highest = -.5;
    if(p1.y>highest) highest=p1.y;
    if(p2.y>highest) highest=p2.y;
    if(p3.y>highest) highest=p3.y;
    return highest;
  }


var light = new vec3(0,0,0);

function clamp(x,a,b){
    return Math.min(Math.max(x,a),b);
};



function setPixel(x,y,col){

    y=floor(y+.5);
    x=floor(x+.5);
    var pos = x*4+y*canvas.width*4;
	
    //if(x<0 || x>canvas.width || y<0 || y>canvas.height) return;

    map_data[pos] = rgb_r(col);
    map_data[pos+1] = rgb_g(col);
    map_data[pos+2] = rgb_b(col);    
}

function rasterPixel(x,y,p1,p2,p3,col){

    var col = 0xFF00FF;
    var mix = 0;

    var center = new vec3(
      (p1.x+p2.x+p3.x),
      (p2.y+p2.y+p3.y),
      (p1.z+p2.z+p3.z),
    ).div(3);

    var distance_to_cam = center.sub(cam.pos).mag()/10;
    alpha = clamp(distance_to_cam, 0, 1);

    var r = lerp(rgb_r(col), rgb_r(mix), alpha);
    var g = lerp(rgb_g(col), rgb_g(mix), alpha);
    var b = lerp(rgb_b(col), rgb_b(mix), alpha);

    setPixel(x,y,r<<16|g<<8|b);  
}

function rasterize(v0,v1,v2){

	var v0_y = v0.y;
	var v0_x = v0.x;

	var v1_y = v1.y;
	var v1_x = v1.x;

	var v2_y = v2.y;
	var v2_x = v2.x;	

    var min_x = clamp(scale_transform_x(Math.min(v0.x, v1.x, v2.x)), 0, width);
    var max_x = clamp(scale_transform_x(Math.max(v0.x, v1.x, v2.x)), 0, width);

    var max_y = clamp(scale_transform_y(Math.min(v0.y, v1.y, v2.y)), 0, height);
    var min_y = clamp(scale_transform_y(Math.max(v0.y, v1.y, v2.y)), 0, height);

	
	var col = 0xFF00FF;
	var secondary_col = 0;
	
    var center = new vec3(
      (v0.x+v1.x+v2.x),
      (v0.y+v1.y+v2.y),
      (v0.z+v1.z+v2.z),
    ).div(3);
	
    var distance_to_cam = center.sub(cam.pos).mag()/10;
    alpha = clamp(distance_to_cam, 0, 1);
	
	var mix_r = lerp((col>>16)&0xFF, (secondary_col>>16)&0xFF, alpha);
	var mix_g = lerp((col>>8)&0xFF, (secondary_col>>16)&0xFF, alpha);
	var mix_b = lerp(col&0xFF, secondary_col&0xFF, alpha);

    for(var y=min_y; y<max_y; y++){
        for(var x=min_x; x<max_x; x++){

			var p_x = squash_x(x);
			var p_y = squash_y(y);
			
			var c1 = (v1_x-v0_x)*(p_y-v0_y)-(v1_y-v0_y)*(p_x-v0_x); 
            var c2 = (v2_x-v1_x)*(p_y-v1_y)-(v2_y-v1_y)*(p_x-v1_x); 
            var c3 = (v0_x-v2_x)*(p_y-v2_y)-(v0_y-v2_y)*(p_x-v2_x); 
			  
            if(c1 >= 0 && c2 >= 0 && c3 >= 0){
			
				x=floor(x+.5);
				y=floor(y+.5);
	
				map_data[x*4+y*width*4] = mix_r;
				map_data[(x*4+y*width*4)+1] = mix_g;
				map_data[(x*4+y*width*4)+2] = mix_b;
				
            }
        }
    }
}


function drawTri(tri,mat4,col){

  var v0 = transform(tri[0],mat4);
  var v1 = transform(tri[1],mat4);
  var v2 = transform(tri[2],mat4);

  var c0 = apply_pers(apply_cam(v0));
  var c1 = apply_pers(apply_cam(v1));
  var c2 = apply_pers(apply_cam(v2));

  drawLine(c0,c1,c2,true);
  drawLine(c1,c2,c0,true);
  drawLine(c2,c0,c1,true);

  if(!WireFrameView){
      rasterize(
        c0,
        c1,
        c2
      );
  }

}

function clearMap(){
    for (var i=0; i<map_data.length; i+=4) {
        map_data[i]=0;
        map_data[i+1]=0;
        map_data[i+2]=0;
    }
}

///////// STATUS INDICATORS //////////

function drawCamIndicators(){

  drawLine(new vec3(0,0),cam.right_vec.mult(aspect_ratio*.1) );
  drawLine(new vec3(0,0),cam.up_vec.mult(aspect_ratio*.1));
  drawLine(new vec3(0,0),cam.foward_vec.mult(aspect_ratio*.1));
}

function displayStatus(){
    ctx.fillStyle="white";
    ctx.font = "15px Arial";
    ctx.fillText(`Position: ${cam.pos.x}, ${cam.pos.y}, ${cam.pos.z}`, 10, 25);
    ctx.fillText(`Orientation: ${cam.rx}, ${cam.ry}, ${cam.rz}`, 10, 45);
    ctx.fillText(`Performance: ${ticks}, ${frames} / ${updated_ticks}, ${updated_frames} (1s interval)`, 10, 65);
    ctx.fillText(`FOV: ${fov}`, 10, 85);
    ctx.fillText(`# of entities: ${entities.length}`, 10, 105);
    ctx.fillText(`# of tris: ${tris_queue.length}`, 10, 125);

}



function renderTris(){
   for(var i=0; i<tris_queue.length; i++){

        var tri = tris_queue[i][0];
        var mat4 = tris_queue[i][1];
        var col = tris_queue[i][2];

        var p1 = array_to_vec3(transform(tri[0],mat4));
        var p2 = array_to_vec3(transform(tri[1],mat4));
        var p3 = array_to_vec3(transform(tri[2],mat4));

        var center = new vec3(
                              (p1.x+p2.x+p3.x)/3, 
                              (p1.y+p2.y+p3.y)/3, 
                              (p1.z+p2.z+p3.z)/3
                    );

        var normal = p3.sub(p2).unit().cross(p2.sub(p1).unit());
        var view_proj = mat4.pos.add(center.sub(mat4.pos)).sub(cam.pos).unit().dot(normal);


        if(view_proj > 0) continue;

        var tri = drawTri(tri,mat4,col);
    }
}

function sortTris(){
    tris_queue.sort(function(a,b){
        var a_tri = a[0];
        var a_mat4 = a[1];

        var b_tri = b[0];
        var b_mat4 = b[1];

        var a_p1 = array_to_vec3(transform(a_tri[0],a_mat4));
        var a_p2 = array_to_vec3(transform(a_tri[1],a_mat4));
        var a_p3 = array_to_vec3(transform(a_tri[2],a_mat4));

        var b_p1 = array_to_vec3(transform(b_tri[0],b_mat4));
        var b_p2 = array_to_vec3(transform(b_tri[1],b_mat4));
        var b_p3 = array_to_vec3(transform(b_tri[2],b_mat4));

        var a_center = new vec3(
                    (a_p1.x+a_p2.x+a_p3.x)/3, 
                    (a_p1.y+a_p2.y+a_p3.y)/3, 
                    (a_p1.z+a_p2.z+a_p3.z)/3
                  );


        var b_center = new vec3(
                    (b_p1.x+b_p2.x+b_p3.x)/3, 
                    (b_p1.y+b_p2.y+b_p3.y)/3, 
                    (b_p1.z+b_p2.z+b_p3.z)/3
                  );

        var a_dist = cam.pos.sub(a_center).mag();
        var b_dist = cam.pos.sub(b_center).mag();

        if (a_dist === b_dist) {
            return 0;
        }
        else {
            return (a_dist < b_dist) ? 1 : -1;
        }
    });
}

function queueTris(tris,mat4,col){
   for(var i=0; i<tris.length; i++){
    tris_queue.push([tris[i], mat4, col]);
  }
}



function render(){
  if(!map_data) return;
 
  clearMap();

  tris_queue=[];
  triangle_buffer=[];

  for (var i=0; i<map_data.length; i+=4) {
     map_data[i] = rgb_r(bg_col);
     map_data[i+1] = rgb_g(bg_col);
     map_data[i+2] = rgb_b(bg_col);
  }

  for(var i=0; i<entities.length; i++){
    queueTris(entities[i].tris,entities[i].mat4,entities[i].color); //Vertice Buffer
  }

  sortTris();
  renderTris() 
 
  if(keys[69]) drawCamIndicators();
  
  ctx.putImageData(imgData,0,0);

  if(cmd_prmpt_enabled){
      ctx.fillStyle="black";
      ctx.fillRect(0,canvas.height-50,canvas.width,35);
      
      ctx.fillStyle="white";
      ctx.font = "20px Courier New";
      ctx.fillText(`${cmd_prmpt}${'|'}`, 10, canvas.height-30);
  }

  if(keys[69] && !cmd_prmpt_enabled) displayStatus();
}



function lerp(a,b,t){ return a+(b-a)*t }

function vec_lerp(a,b,t){
    return a.add(b.sub(a)).mult(t);
}

function update(dt){
  
    if(!running) return;
    a+=.1;
    if(a>=2*pi)a=0;

    var flat_foward = new vec3(sin(cam.ry),0,cos(cam.ry));

    velocity = velocity.add(new vec3(0,-.9/canvas.height,0));
    light = cam.pos;

    if(plr_pos.y+velocity.y <= 0){
        plr_pos.y = 0;
        velocity = new vec3(0,0,0);
    }

    plr_pos = plr_pos.add(velocity);
    cam.pos = plr_pos.add(new vec3(0,2,0));
    //player_cube.mat4.pos = plr_pos;

    if(!cmd_prmpt_enabled){
        if (keys[65]) plr_pos = plr_pos.sub(cam.right_vec.mult(cam_spd/canvas.width));
        if (keys[68]) plr_pos = plr_pos.add(cam.right_vec.mult(cam_spd/canvas.width));

        if (keys[83]) plr_pos = plr_pos.sub(flat_foward.mult(cam_spd/canvas.width));
        if (keys[87]) plr_pos = plr_pos.add(flat_foward.mult(cam_spd/canvas.width));

        if (keys[37]) cam.rot(0,-rad(1),0);
        if (keys[39]) cam.rot(0,rad(1),0);

        if (keys[38]) cam.rot(-rad(1),0,0);
        if (keys[40]) cam.rot(rad(1),0,0);
    }

    cam_spd = keys[16]?30:15;

    cam.rx = Math.max(Math.min(cam.rx,rad(y_rot_bound)),rad(-y_rot_bound));
    
    if(focused){
        var flag0 = (cam.rx>=rad(y_rot_bound));
        var flag1 = (cam.rx<=-rad(y_rot_bound));

        var except = (((delta_y<0&&flag1)||(delta_y>0&flag0))?0:1);
        cam.rot(0,rad(delta_x*mouse_sensitivity),0);
        cam.rot(rad(delta_y*mouse_sensitivity)*except,0,0);
    }
    
  delta_x = lerp(delta_x, m_x-last_x, .777);
  delta_y = lerp(delta_y, m_y-last_y, .777);

  last_x = m_x;
  last_y = m_y;  
}

function read(commands){
    var func = commands[0];
        
    switch(func){
        case 'set':
          var variable = commands[1];
          this[variable] = commands[2];      
        break;
        case 'run':
          eval(commands[1]);
        break;
        case 'freeze':
            running=false;
        break;
        case 'unfreeze':
            running=true;
        break;
    }
}

document.addEventListener("mousemove",function(event){
    var rect = canvas.getBoundingClientRect();
    client_x = Math.max(Math.min(event.clientX-rect.left,canvas.width),0);
    client_y = Math.max(Math.min(event.clientY-rect.top,canvas.height),0);

    m_x += event.movementX;
    m_y += event.movementY;
});

document.addEventListener("keydown",function(event){
  keys[event.keyCode] = true;

  if(cmd_prmpt_enabled){
      if(event.location==0 && event.keyCode!=8 && event.keyCode!=13) cmd_prmpt+=event.key;
      if(event.keyCode==8) cmd_prmpt = cmd_prmpt.slice(0,cmd_prmpt.length-1);
  }
  if(event.keyCode == 86) WireFrameView = !WireFrameView;
  if(event.keyCode==13){
    cmd_prmpt_enabled = false;
    var commands = cmd_prmpt.split(" ");
    try{
        read(commands);
    }catch(err){
        console.log(err);
    }
  }

  switch(event.keyCode){
    case 191:
      cmd_prmpt_enabled = true;
    break;
  }

  if(event.keyCode==32 && !cmd_prmpt_enabled){
      plr_pos.y += .1/canvas.height; 
      velocity = velocity.add(new vec3(0,30/canvas.height,0));
  }
});

document.addEventListener("keyup",function(event){
  keys[event.keyCode] = false;
});

canvas.addEventListener("mousedown",function(){
  canvas.requestPointerLock({
    unadjustedMovement: true,
  });
  mouse_down=true;
},false);

document.addEventListener("pointerlockchange", function(event){
    focused=document.pointerLockElement?true:false;
});

document.addEventListener("mouseup",function(){
  mouse_down=false;
});

function init(){
  var now = Date.now();
  delta+=(now-lastTime)/fps;
  lastTime = now;
 
  while(delta>=1){
      delta--;
      update(delta);
      ticks++;
  }
 
  frames++;
  render();
 
  if(Date.now() - lastFPSReq >= 1000){
      updated_frames = frames;
      updated_ticks = ticks;
      frames=0;
      ticks=0;
      lastFPSReq = Date.now();
  }
 
  window.requestAnimationFrame(init);
}



window.requestAnimationFrame(init);