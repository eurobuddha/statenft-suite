package com.eurobuddha.statenft;
import android.app.Activity;
import android.content.*;
import android.graphics.Matrix;
import android.os.Looper;
import android.view.*;
import android.widget.*;
import java.lang.reflect.*;
import java.util.*;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk=33)
public class AtelierViewerTest {
    private Activity act;private StateNft.Meta meta;private final List<StateNft.Item> items=new ArrayList<>();private StateNft.Item transferred;
    private ViewerScreen.Host host=new ViewerScreen.Host(){public void onCloseViewer(){fail("Unexpected close");}public void onTransferItem(StateNft.Item item){transferred=item;}};
    @Before public void setup()throws Exception{
        act=Robolectric.buildActivity(Activity.class).setup().get();act.setTheme(androidx.appcompat.R.style.Theme_AppCompat);
        meta=new StateNft.Meta();meta.name="Literal art 中文 Русский Українська";meta.tokenid="0x"+"ab".repeat(32);meta.size=2;meta.description="Original description";
        for(int i=1;i<=2;i++){StateNft.Item it=new StateNft.Item();it.index=i;it.owned=true;it.coin=new JSONObject().put("coinid","0x"+String.valueOf(i).repeat(64)).put("state",new JSONArray().put(new JSONObject().put("port",0).put("data",String.valueOf(i))));items.add(it);}
    }
    @After public void cleanup(){act.finish();}
    private static <T>T find(View root,Class<T> type){if(type.isInstance(root))return type.cast(root);if(root instanceof ViewGroup)for(int i=0;i<((ViewGroup)root).getChildCount();i++){T v=find(((ViewGroup)root).getChildAt(i),type);if(v!=null)return v;}return null;}
    private static TextView text(View root,String label){if(root instanceof TextView&&label.contentEquals(((TextView)root).getText()))return(TextView)root;if(root instanceof ViewGroup)for(int i=0;i<((ViewGroup)root).getChildCount();i++){TextView v=text(((ViewGroup)root).getChildAt(i),label);if(v!=null)return v;}return null;}
    private View build(){View root=ViewerScreen.build(act,host,meta,items,0);act.setContentView(root);layout(root,480);Shadows.shadowOf(Looper.getMainLooper()).idle();return root;}
    private static void layout(View root,int width){root.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(1000,View.MeasureSpec.EXACTLY));root.layout(0,0,width,1000);}
    @Test public void malformedTraitsAreSkippedAndValidTraitsFormCompleteRows()throws Exception{
        JSONArray attrs=new JSONArray().put(JSONObject.NULL).put("bad").put(new JSONObject().put("trait_type","A").put("value","one")).put(JSONObject.NULL).put(new JSONObject().put("trait_type","B").put("value","two")).put(new JSONObject().put("trait_type","C").put("value","three")).put(42).put(new JSONObject().put("trait_type","D").put("value","four"));meta.attributes=attrs;String before=attrs.toString();View root=build();
        for(String value:new String[]{"one","two","three","four"})assertNotNull(text(root,value));
        ViewGroup first=(ViewGroup)text(root,"one").getParent().getParent(),last=(ViewGroup)text(root,"four").getParent().getParent();assertEquals(3,first.getChildCount());assertEquals(3,last.getChildCount());assertNotSame(first,last);assertSame(first,text(root,"three").getParent().getParent());assertEquals(before,attrs.toString());
    }
    @Test public void swipingToAnItemWithoutAnImageInvalidatesTheOldRequestTag(){View root=build();ViewerScreen.ZoomImage image=find(root,ViewerScreen.ZoomImage.class);image.setTag("https://previous.invalid/image");image.listener.next();assertEquals("",image.getTag());assertNotNull(image.getDrawable());}
    @Test public void collectionTraitsOverrideSingleNftAttributes()throws Exception{
        meta.attributes=new JSONArray().put(new JSONObject().put("trait_type","Single").put("value","fallback"));meta.itemTraits=new JSONObject().put("1",new JSONArray().put(JSONObject.NULL).put(new JSONObject().put("trait_type","Lot").put("value","lot one")));View root=build();assertNotNull(text(root,"lot one"));assertNull(text(root,"fallback"));find(root,ViewerScreen.ZoomImage.class).listener.next();assertNotNull(text(root,"fallback"));
    }
}
