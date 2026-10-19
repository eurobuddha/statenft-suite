package com.eurobuddha.statenft;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class AtelierMetadataTest {
    private static JSONObject obj(Object...values)throws Exception{JSONObject o=new JSONObject();for(int i=0;i<values.length;i+=2)o.put((String)values[i],values[i+1]);return o;}
    @Test public void serializedRootNamesAndEnvelopesPreserveAllCollectionFields()throws Exception{
        JSONObject traits=obj("1",new JSONArray().put(obj("trait_type","Artist","value","中文 Українська")));
        JSONObject detail=obj("name","Art 中文 Русский Українська","description","Literal description","mode","url","size",12,"base","https://example.invalid/art/","ext",".svg","url","https://example.invalid/cover.png","traits",traits,"attributes",new JSONArray().put(obj("trait_type","Year","value",2026)),"external_url","https://example.invalid/item","webvalidate","https://example.invalid/proof","ticker","ART");
        for(Object metadata:new Object[]{detail,detail.toString()})for(Object token:new Object[]{obj("name",metadata),obj("name",metadata).toString()}){
            JSONObject envelope=obj("token",token,"total","12","script","RETURN TRUE");String before=envelope.toString();
            for(Object raw:new Object[]{token,envelope,envelope.toString()}){
                StateNft.Meta m=StateNft.parseMeta("0x01",raw);assertEquals("Art 中文 Русский Українська",m.name);assertEquals(m.name,Util.tokenName(raw));assertEquals("Literal description",m.description);assertEquals(12,m.size);assertEquals("url",m.mode);assertEquals("https://example.invalid/cover.png",m.icon);assertEquals("https://example.invalid/art/3.svg",StateNft.imageUrl(m,3,null));assertEquals(traits.toString(),m.itemTraits.toString());assertEquals(1,m.attributes.length());assertEquals("https://example.invalid/item",m.externalUrl);assertEquals("https://example.invalid/proof",m.webvalidate);
            }
            assertEquals(before,envelope.toString());
        }
    }
    @Test public void envelopeFallbacksStillWorkWithoutMutatingEitherLayer()throws Exception{
        JSONObject inner=obj("name",obj("name","Legacy").toString());JSONObject outer=obj("token",inner.toString(),"totalamount","17","url","https://example.invalid/cover");String before=outer.toString();StateNft.Meta m=StateNft.parseMeta("0x02",outer.toString());assertEquals("Legacy",m.name);assertEquals(17,m.size);assertEquals("https://example.invalid/cover",m.icon);assertEquals(before,outer.toString());
    }
    @Test public void missingNamesDoNotShowStructuredJsonAndLiteralNamesStayLiteral()throws Exception{
        JSONObject detail=obj("url","data:image/png;base64,"+"AAAA".repeat(1000));
        for(Object name:new Object[]{detail,detail.toString()}){JSONObject raw=obj("name",name);assertEquals("Collection",StateNft.parseMeta("0x03",raw).name);assertEquals("Token",Util.tokenName(raw));}
        for(String name:new String[]{"Token","Send","[1,2]","{unfinished","中文 Русский Українська"}){assertEquals(name,StateNft.parseMeta("0x03",name).name);assertEquals(name,Util.tokenName(name));}
        assertNull(Util.asObject(null));assertNull(Util.asObject(JSONObject.NULL));assertNull(Util.asObject("{unfinished"));
    }
    @Test public void collectionMetadataKeepsLargeEmbeddedIconBytesLiteral()throws Exception{
        String b64="AAAA".repeat(32768),image="<artimage>"+b64+"</artimage>";JSONObject raw=obj("name",obj("name","Image collection","mode","embed","size",3,"url",image).toString());String before=raw.toString();StateNft.Meta m=StateNft.parseMeta("0x04",raw.toString());assertEquals(image,m.icon);assertEquals("Image collection",m.name);assertEquals(before,raw.toString());
    }
}
